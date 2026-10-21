package com.legacyvault.verification;

import com.legacyvault.auth.*;
import com.legacyvault.auth.dto.LoginRequest;
import com.legacyvault.auth.recovery.*;
import com.legacyvault.common.error.*;
import com.legacyvault.user.repository.UserRepository;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/** Actual SQL Server, Flyway, transaction locks, JPA, shared auth and HTTP security. No real email. */
class PasswordRecoverySqlServerTest extends LegalBasisSqlServerSupport {
    static final String OLD="Old-password-123",NEW="New-password-456";
    PasswordRecoveryService service() { return context.getBean(PasswordRecoveryService.class); }
    RecoverySecrets secrets() { return context.getBean(RecoverySecrets.class); }
    record Account(long id,UUID publicId,String email) { }
    Account account() {
        UUID id=UUID.randomUUID(); String email=id+"@example.test";
        long key=jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status,password_login_enabled) OUTPUT inserted.user_id VALUES (?,'Recovery fixture',?,?,'ACTIVE',1)",Long.class,id.toString(),email,context.getBean(PasswordEncoder.class).encode(OLD));
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_VAULT_OWNER'",key);
        return new Account(key,id,email);
    }
    PasswordRecoveryService.Delivery issue(Account a) {
        service().enqueue(a.email(),"en"); Long id=service().claim(); assertNotNull(id);
        var delivery=service().prepare(id); assertNotNull(delivery); service().mark(id,"ACCEPTED"); return delivery;
    }
    ErrorCode failure(Runnable r) { return assertThrows(BusinessException.class,r::run).getErrorCode(); }
    @Test void resetChangesPasswordConsumesOnceRevokesAllLinksAndOldJwtAtNextHttpRequest() throws Exception {
        var a=account(); var first=issue(a); var second=issue(a);
        var auth=context.getBean(AuthService.class);
        String oldJwt=auth.login(new LoginRequest(a.email(),OLD)).accessToken();
        service().reset(first.credential(),NEW);
        assertEquals(ErrorCode.INVALID_CREDENTIALS,failure(()->auth.login(new LoginRequest(a.email(),OLD))));
        var login=auth.login(new LoginRequest(a.email(),NEW)); assertEquals(List.of("VAULT_OWNER"),login.user().roles());
        assertEquals(ErrorCode.RECOVERY_INVALID,failure(()->service().reset(first.credential(),OLD)));
        assertEquals(ErrorCode.RECOVERY_INVALID,failure(()->service().reset(second.credential(),OLD)));
        var mvc=MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity()).build();
        assertEquals(401,mvc.perform(get("/api/v1/auth/me").header("Authorization","Bearer "+oldJwt)).andReturn().getResponse().getStatus());
        assertEquals(200,mvc.perform(get("/api/v1/auth/me").header("Authorization","Bearer "+login.accessToken())).andReturn().getResponse().getStatus());
        assertEquals(1L,jdbc.queryForObject("SELECT auth_version FROM dbo.users WHERE user_id=?",Long.class,a.id()));
    }
    @Test void simultaneousReplayAndDifferentLinksHaveOnlyOneWinner() throws Exception {
        for(boolean same:List.of(true,false)) {
            var a=account(); String first=issue(a).credential(),second=same?first:issue(a).credential();
            try(var pool=Executors.newFixedThreadPool(2)) {
                var start=new CountDownLatch(1);
                var futures=List.of(pool.submit(()->resetAfter(start,first)),pool.submit(()->resetAfter(start,second)));
                start.countDown(); int successes=0;
                for(var f:futures) if(f.get(20,TimeUnit.SECONDS)) successes++;
                assertEquals(1,successes);
            }
            assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.password_reset_credentials WHERE user_id=? AND consumed_at IS NOT NULL",Integer.class,a.id()));
        }
    }
    boolean resetAfter(CountDownLatch start,String raw) throws Exception {
        start.await(); try { service().reset(raw,NEW); return true; }
        catch(BusinessException e) { assertEquals(ErrorCode.RECOVERY_INVALID,e.getErrorCode()); return false; }
    }
    @Test void auditFailureRollsBackPasswordConsumptionVersionAndRevocation() {
        var a=account(); var first=issue(a); var second=issue(a);
        jdbc.execute("CREATE TRIGGER dbo.TR_recovery_test_failure ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='AUTH_PASSWORD_RESET') THROW 51412,'Injected fixture failure',1; END");
        try { assertThrows(RuntimeException.class,()->service().reset(first.credential(),NEW)); }
        finally { jdbc.execute("DROP TRIGGER dbo.TR_recovery_test_failure"); }
        assertEquals(0L,jdbc.queryForObject("SELECT auth_version FROM dbo.users WHERE user_id=?",Long.class,a.id()));
        assertEquals(2,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.password_reset_credentials WHERE user_id=? AND consumed_at IS NULL AND revoked_at IS NULL",Integer.class,a.id()));
        assertNotNull(context.getBean(AuthService.class).login(new LoginRequest(a.email(),OLD)));
        service().reset(second.credential(),NEW);
    }
    @Test void invalidExpiredLockedDeletedGoogleOnlyAndPendingCannotReset() {
        assertEquals(ErrorCode.RECOVERY_INVALID,failure(()->service().reset(secrets().generate(),NEW)));
        for(String state:List.of("expired","locked","deleted","google","pending")) {
            var a=account(); String raw=issue(a).credential();
            switch(state) {
                case "expired" -> jdbc.update("UPDATE dbo.password_reset_credentials SET created_at=DATEADD(minute,-20,SYSUTCDATETIME()),expires_at=DATEADD(minute,-1,SYSUTCDATETIME()) WHERE user_id=?",a.id());
                case "locked" -> jdbc.update("UPDATE dbo.users SET status='LOCKED' WHERE user_id=?",a.id());
                case "deleted" -> jdbc.update("UPDATE dbo.users SET deleted_at=SYSUTCDATETIME() WHERE user_id=?",a.id());
                case "google" -> jdbc.update("UPDATE dbo.users SET password_login_enabled=0 WHERE user_id=?",a.id());
                case "pending" -> jdbc.update("UPDATE dbo.users SET status='PENDING' WHERE user_id=?",a.id());
            }
            assertEquals(ErrorCode.RECOVERY_INVALID,failure(()->service().reset(raw,NEW)),state);
            assertEquals(0L,jdbc.queryForObject("SELECT auth_version FROM dbo.users WHERE user_id=?",Long.class,a.id()));
        }
    }
    @Test void accountLockCommittedWhileResetWaitsIsRereadUnderLock() throws Exception {
        var a=account(); String raw=issue(a).credential();
        var locked=new CountDownLatch(1); var release=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var writer=pool.submit(()->tx.execute(status->{
                jdbc.update("UPDATE dbo.users SET status='LOCKED' WHERE user_id=?",a.id()); locked.countDown();
                try { assertTrue(release.await(10,TimeUnit.SECONDS)); } catch(InterruptedException e) { throw new RuntimeException(e); }
                return null;
            }));
            assertTrue(locked.await(10,TimeUnit.SECONDS));
            var began=new CountDownLatch(1); var resetSession=new java.util.concurrent.atomic.AtomicInteger();
            var reset=pool.submit(()->tx.execute(status->{
                resetSession.set(jdbc.queryForObject("SELECT @@SPID",Integer.class)); began.countDown();
                var code=failure(()->service().reset(raw,NEW)); status.setRollbackOnly(); return code;
            }));
            try {
                assertTrue(began.await(5,TimeUnit.SECONDS));
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5); boolean waiting=false;
                while(System.nanoTime()<deadline) {
                    waiting=jdbc.queryForObject("SELECT COUNT(*) FROM sys.dm_exec_requests WHERE session_id=? AND wait_type LIKE 'LCK_M_%'",Integer.class,resetSession.get())>0;
                    if(waiting) break;
                    java.util.concurrent.locks.LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(10));
                }
                assertTrue(waiting,"The reset must actually wait for the account write lock before release");
                assertFalse(reset.isDone());
            } finally { release.countDown(); }
            writer.get(10,TimeUnit.SECONDS);
            assertEquals(ErrorCode.RECOVERY_INVALID,reset.get(10,TimeUnit.SECONDS));
        }
    }
    @Test void limiterIsAtomicAcrossConcurrentTransactionsAndUsesRollingWindow() throws Exception {
        var limiter=context.getBean(RecoveryRateLimiter.class); String ip=UUID.randomUUID().toString();
        try(var pool=Executors.newFixedThreadPool(8)) {
            List<Future<Boolean>> futures=new ArrayList<>();
            for(int i=0;i<12;i++) futures.add(pool.submit(()->limiter.allow("fixture-limit",ip,5,60)));
            int allowed=0; for(var f:futures) if(f.get(20,TimeUnit.SECONDS)) allowed++;
            assertEquals(5,allowed);
        }
        jdbc.update("UPDATE dbo.password_recovery_limits SET occurred_at=DATEADD(minute,-2,SYSUTCDATETIME()) WHERE bucket_hash=?",secrets().bucket("fixture-limit",ip));
        assertTrue(limiter.allow("fixture-limit",ip,5,60));
    }
    @Test void requestIsNeutralAndEmailCooldownDoesNotRevealEligibility() {
        var config=mock(RecoveryConfiguration.class); when(config.ready()).thenReturn(true);
        var controller=new PasswordRecoveryController(config,context.getBean(RecoveryRateLimiter.class),service());
        var a=account(); var request=new org.springframework.mock.web.MockHttpServletRequest(); request.setRemoteAddr("192.0.2."+new Random().nextInt(200));
        Object expected=null;
        for(String email:List.of(a.email(),UUID.randomUUID()+"@unknown.test",a.email())) {
            var response=controller.request(new PasswordRecoveryController.Request(email,"vi"),request);
            assertEquals(202,response.getStatusCode().value());
            if(expected==null) expected=response.getBody(); else assertEquals(expected,response.getBody());
        }
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.password_recovery_jobs WHERE email=?",Integer.class,a.email()));
        while(service().claim()!=null) { /* drain request-only fixture jobs before other tests */ }
    }
    @Test void disabledDeliveryReturns503AndResetIgnoresStaleBearerWithoutExposingCredential() throws Exception {
        var mvc=MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity()).build();
        var unavailable=mvc.perform(post("/api/v1/auth/password-recovery/requests").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"nobody@example.test\"}")).andReturn().getResponse();
        assertEquals(503,unavailable.getStatus()); assertTrue(unavailable.getContentAsString().contains("RECOVERY_UNAVAILABLE"));
        var a=account(); String raw=issue(a).credential();
        var response=mvc.perform(post("/api/v1/auth/password-recovery/reset").header("Authorization","Bearer stale-jwt")
                .contentType(MediaType.APPLICATION_JSON).content("{\"credential\":\""+raw+"\",\"password\":\""+NEW+"\"}")).andReturn().getResponse();
        assertEquals(204,response.getStatus(),response.getContentAsString());
        assertEquals("no-store",response.getHeader("Cache-Control")); assertEquals("",response.getContentAsString());
    }
    @Test void credentialsNeverAppearInStoredJobsAuditOrHashesAndThreeLinksRemainUsable() {
        var a=account(); var raw=issue(a).credential(); issue(a); issue(a);
        service().enqueue(a.email(),"vi"); Long id=service().claim(); assertNull(service().prepare(id));
        assertEquals(3,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.password_reset_credentials WHERE user_id=?",Integer.class,a.id()));
        String stored=jdbc.queryForObject("SELECT credential_hash FROM dbo.password_reset_credentials WHERE credential_hash=?",String.class,secrets().hash(raw));
        assertNotEquals(raw,stored);
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.audit_logs WHERE actor_user_id=? AND (details LIKE ? OR state_before LIKE ? OR state_after LIKE ?)",Integer.class,a.id(),"%"+raw+"%","%"+raw+"%","%"+raw+"%"));
    }
    @Test void queuedBeforeResetCannotIssueNewCredentialAfterResetAndWorkerUsesFixtureTransport() {
        var a=account(); String raw=issue(a).credential(); service().enqueue(a.email(),"en");
        service().reset(raw,NEW); Long id=service().claim(); assertNull(service().prepare(id));
        var b=account(); service().enqueue(b.email(),"vi");
        var transport=mock(RecoveryMailTransport.class);
        new RecoveryDeliveryWorker(service(),transport).deliver();
        verify(transport).send(eq(b.email()),eq("vi"),argThat(secrets()::valid));
    }
    @Test void unknownAndIneligibleJobsAreSkippedWithoutIssuingCredentials() {
        service().enqueue(UUID.randomUUID()+"@unknown.test","vi");
        assertNull(service().prepare(service().claim()));
        for(String state:List.of("LOCKED","PENDING","DELETED","GOOGLE")) {
            var a=account();
            if(state.equals("GOOGLE")) jdbc.update("UPDATE dbo.users SET password_login_enabled=0 WHERE user_id=?",a.id());
            else if(state.equals("DELETED")) jdbc.update("UPDATE dbo.users SET deleted_at=SYSUTCDATETIME() WHERE user_id=?",a.id());
            else jdbc.update("UPDATE dbo.users SET status=? WHERE user_id=?",state,a.id());
            service().enqueue(a.email(),"en"); assertNull(service().prepare(service().claim()));
            assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.password_reset_credentials WHERE user_id=?",Integer.class,a.id()));
        }
    }
    @Test void concurrentWorkersClaimEachJobOnce() throws Exception {
        var a=account(); for(int i=0;i<3;i++) service().enqueue(a.email(),"vi");
        var transport=mock(RecoveryMailTransport.class);
        var worker=new RecoveryDeliveryWorker(service(),transport);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var x=pool.submit(worker::deliver); var y=pool.submit(worker::deliver);
            x.get(20,TimeUnit.SECONDS); y.get(20,TimeUnit.SECONDS);
        }
        verify(transport,times(3)).send(eq(a.email()),eq("vi"),anyString());
        assertEquals(3,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.password_recovery_jobs WHERE email=? AND status='ACCEPTED'",Integer.class,a.email()));
    }
    @Test void legacyJwtWithoutVersionIsRejectedAndRecoveryDoesNotAcceptAccessOrInvitationTokens() throws Exception {
        var a=account();
        String legacy=io.jsonwebtoken.Jwts.builder().subject(a.publicId().toString())
                .expiration(java.util.Date.from(Instant.now().plusSeconds(300)))
                .signWith(io.jsonwebtoken.security.Keys.hmacShaKeyFor(new byte[32])).compact();
        var mvc=MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity()).build();
        assertEquals(401,mvc.perform(get("/api/v1/auth/me").header("Authorization","Bearer "+legacy)).andReturn().getResponse().getStatus());
        for(String other:List.of(legacy,"a".repeat(22),"invalid-marker"))
            assertEquals(ErrorCode.RECOVERY_INVALID,failure(()->service().reset(other,NEW)));
    }
    @Test void unknownLegacyCapabilityKeepsPasswordLoginButDisablesRecoveryAndExplicitGoogleOnlyDisablesPasswordLogin() {
        var a=account(); jdbc.update("UPDATE dbo.users SET password_login_enabled=NULL WHERE user_id=?",a.id());
        assertNotNull(context.getBean(AuthService.class).login(new LoginRequest(a.email(),OLD)));
        service().enqueue(a.email(),"vi"); assertNull(service().prepare(service().claim()));
        jdbc.update("UPDATE dbo.users SET password_login_enabled=0 WHERE user_id=?",a.id());
        assertEquals(ErrorCode.INVALID_CREDENTIALS,failure(()->context.getBean(AuthService.class).login(new LoginRequest(a.email(),OLD))));
    }
    @Test void linkedGoogleLoginSharesRevocationAndResetPreservesProviderIdentity() throws Exception {
        var a=account(); String subject="fixture-google-"+UUID.randomUUID();
        jdbc.update("INSERT dbo.external_auth_identities(provider_code,subject,user_id) VALUES ('GOOGLE',?,?)",subject,a.id());
        var verifier=mock(GoogleIdTokenVerifier.class);
        when(verifier.verify("fixture-google-credential")).thenReturn(new GoogleIdTokenVerifier.VerifiedGoogleCredential(
                subject,"b".repeat(64),Instant.now().plusSeconds(300)));
        var google=new GoogleAuthService(verifier,
                context.getBean(com.legacyvault.user.repository.ExternalAuthIdentityRepository.class),
                context.getBean(UserRepository.class),
                context.getBean(com.legacyvault.auth.repository.GoogleLoginCredentialUseRepository.class),
                context.getBean(AuthService.class),context.getBean(com.legacyvault.audit.AuditService.class));
        String token=tx.execute(status->google.login(new com.legacyvault.auth.dto.GoogleLoginRequest("fixture-google-credential")).accessToken());
        String raw=issue(a).credential(); service().reset(raw,NEW);
        var mvc=MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity()).build();
        assertEquals(401,mvc.perform(get("/api/v1/auth/me").header("Authorization","Bearer "+token)).andReturn().getResponse().getStatus());
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.external_auth_identities WHERE user_id=? AND subject=?",Integer.class,a.id(),subject));
    }
    @Test void credentialIssuedToPreviousEmailCannotResetAfterAccountEmailChanges() {
        var a=account(); String raw=issue(a).credential();
        jdbc.update("UPDATE dbo.users SET email=? WHERE user_id=?",UUID.randomUUID()+"@changed.test",a.id());
        assertEquals(ErrorCode.RECOVERY_INVALID,failure(()->service().reset(raw,NEW)));
        assertEquals(0L,jdbc.queryForObject("SELECT auth_version FROM dbo.users WHERE user_id=?",Long.class,a.id()));
    }
    @Test void preparingSameJobTwiceCannotIssueAnotherCredential() {
        var a=account(); service().enqueue(a.email(),"vi"); Long id=service().claim();
        assertNotNull(service().prepare(id));
        assertNull(service().prepare(id));
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.password_reset_credentials WHERE user_id=?",Integer.class,a.id()));
        service().mark(id,"FAILED");
    }
    @Test void resetWatermarkRoundTripsUtcDuringJvmDstGap() {
        var a=account(); var original=TimeZone.getDefault();
        LocalDateTime utcGap=LocalDateTime.of(2026,3,8,2,30);
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"));
            tx.execute(status->{
                var user=context.getBean(UserRepository.class).findById(a.id()).orElseThrow();
                user.advanceAuthVersion(utcGap); context.getBean(UserRepository.class).saveAndFlush(user); return null;
            });
            var stored=jdbc.queryForObject("SELECT password_reset_at FROM dbo.users WHERE user_id=?",(rs,n)->rs.getObject(1,LocalDateTime.class),a.id());
            assertEquals(utcGap,stored);
        } finally { TimeZone.setDefault(original); }
    }
    @Test void concurrentPrepareOfSameJobReturnsOneCredentialOnly() throws Exception {
        var a=account(); service().enqueue(a.email(),"vi"); Long id=service().claim();
        try(var pool=Executors.newFixedThreadPool(2)) {
            var start=new CountDownLatch(1);
            Callable<PasswordRecoveryService.Delivery> prepare=()->{start.await();return service().prepare(id);};
            var x=pool.submit(prepare); var y=pool.submit(prepare); start.countDown();
            int issued=(x.get(20,TimeUnit.SECONDS)!=null?1:0)+(y.get(20,TimeUnit.SECONDS)!=null?1:0);
            assertEquals(1,issued);
        }
        assertEquals(1,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.password_reset_credentials WHERE user_id=?",Integer.class,a.id()));
        service().mark(id,"FAILED");
    }
    @Test void prepareAuditFailureRollsBackJobStateAndCredentialSoKnownRollbackCanRetry() {
        var a=account(); service().enqueue(a.email(),"vi"); Long id=service().claim();
        jdbc.execute("CREATE TRIGGER dbo.TR_recovery_issue_test_failure ON dbo.audit_logs AFTER INSERT AS BEGIN IF EXISTS(SELECT 1 FROM inserted WHERE action='AUTH_RECOVERY_ISSUED') THROW 51413,'Injected fixture failure',1; END");
        try { assertThrows(RuntimeException.class,()->service().prepare(id)); }
        finally { jdbc.execute("DROP TRIGGER dbo.TR_recovery_issue_test_failure"); }
        assertEquals("CLAIMED",jdbc.queryForObject("SELECT status FROM dbo.password_recovery_jobs WHERE job_id=?",String.class,id));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.password_reset_credentials WHERE user_id=?",Integer.class,a.id()));
        assertNotNull(service().prepare(id)); assertNull(service().prepare(id)); service().mark(id,"ACCEPTED");
    }
    @Test void emailChangedAfterLookupCannotRetargetQueuedRecovery() {
        var a=account(); service().enqueue(a.email(),"vi"); Long id=service().claim();
        var realUsers=context.getBean(UserRepository.class);
        var hookedUsers=mock(UserRepository.class);
        when(hookedUsers.findByEmail(a.email())).thenAnswer(call->realUsers.findByEmail(a.email()));
        when(hookedUsers.findActiveAccountForUpdate(a.id())).thenAnswer(call->{
            // Simulate an email update between hydrated candidate lookup and lock/refresh.
            jdbc.update("UPDATE dbo.users SET email=? WHERE user_id=?",UUID.randomUUID()+"@changed.test",a.id());
            return realUsers.findActiveAccountForUpdate(a.id());
        });
        var hooked=new PasswordRecoveryService(jdbc,hookedUsers,entities,context.getBean(PasswordEncoder.class),secrets(),context.getBean(com.legacyvault.audit.AuditService.class));
        assertNull(tx.execute(status->hooked.prepare(id)));
        assertEquals("SKIPPED",jdbc.queryForObject("SELECT status FROM dbo.password_recovery_jobs WHERE job_id=?",String.class,id));
        assertEquals(0,jdbc.queryForObject("SELECT COUNT(*) FROM dbo.password_reset_credentials WHERE user_id=?",Integer.class,a.id()));
    }
    @Test void caseOnlyEmailChangeKeepsBindingButTerminalJobsCannotBeRequeued() {
        var a=account(); var delivery=issue(a);
        jdbc.update("UPDATE dbo.users SET email=? WHERE user_id=?",a.email().toUpperCase(Locale.ROOT),a.id());
        service().reset(delivery.credential(),NEW);
        assertThrows(IllegalArgumentException.class,()->service().mark(delivery.jobId(),"QUEUED"));
        service().mark(delivery.jobId(),"FAILED");
        assertEquals("ACCEPTED",jdbc.queryForObject("SELECT status FROM dbo.password_recovery_jobs WHERE job_id=?",String.class,delivery.jobId()));
    }
}
