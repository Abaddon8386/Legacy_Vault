package com.legacyvault.verification;

import com.legacyvault.auth.*;
import com.legacyvault.auth.dto.LoginRequest;
import com.legacyvault.auth.emailverification.*;
import com.legacyvault.auth.recovery.*;
import com.legacyvault.common.error.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * PS-116 on real SQL Server + Flyway + JPA locks + HTTP security. No real mail: the transport is a test double.
 * Policy values are injected into the real configuration bean only for the duration of a test; production has no defaults.
 */
class EmailVerificationSqlServerTest extends LegalBasisSqlServerSupport {
    static final String PASSWORD="Old-password-123";
    record Account(long id,UUID publicId,String email) { }

    EmailVerificationService service() { return context.getBean(EmailVerificationService.class); }
    EmailVerificationSecrets secrets() { return context.getBean(EmailVerificationSecrets.class); }
    EmailVerificationConfiguration config() { return context.getBean(EmailVerificationConfiguration.class); }
    MockMvc mvc() { return MockMvcBuilders.webAppContextSetup((WebApplicationContext)context).apply(springSecurity()).build(); }

    static final EmailVerificationConfiguration.Limit LOOSE_SEND=new EmailVerificationConfiguration.Limit(50,3600);
    static final EmailVerificationConfiguration.Limit LOOSE_CONFIRM=new EmailVerificationConfiguration.Limit(1000,900);
    void configure(boolean delivery,List<EmailVerificationConfiguration.Limit> send,EmailVerificationConfiguration.Limit confirm) {
        var c=config();
        ReflectionTestUtils.setField(c,"deliveryEnabled",delivery); ReflectionTestUtils.setField(c,"ttlMinutes",30);
        ReflectionTestUtils.setField(c,"sendLimits",send); ReflectionTestUtils.setField(c,"confirmLimit",confirm);
    }
    /** Approved production windows: 60 s cooldown, 3 per 15 min, 5 per 24 h; confirm 5 per 15 min per IP. */
    void approvedLimits() {
        configure(true,List.of(new EmailVerificationConfiguration.Limit(1,60),new EmailVerificationConfiguration.Limit(3,900),
                new EmailVerificationConfiguration.Limit(5,86400)),new EmailVerificationConfiguration.Limit(5,900));
    }
    @BeforeEach void ready() {
        configure(true,List.of(LOOSE_SEND),LOOSE_CONFIRM);
        jdbc.update("UPDATE dbo.email_verification_jobs SET status='SKIPPED' WHERE status IN ('QUEUED','CLAIMED','PREPARED')");
    }
    @AfterEach void notReady() { configure(false,List.of(LOOSE_SEND),LOOSE_CONFIRM); }

    Account account(boolean passwordLogin) {
        UUID id=UUID.randomUUID(); String email=id+"@example.test";
        long key=jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status,password_login_enabled) OUTPUT inserted.user_id VALUES (?,'Verify fixture',?,?,'ACTIVE',?)",
                Long.class,id.toString(),email,context.getBean(PasswordEncoder.class).encode(PASSWORD),passwordLogin?1:0);
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_VAULT_OWNER'",key);
        return new Account(key,id,email);
    }
    Account account() { return account(true); }
    EmailVerificationService.Delivery issue(Account a) {
        assertEquals(EmailVerificationService.Outcome.QUEUED,service().enqueue(a.id(),"en"));
        Long id=service().claim(); assertNotNull(id);
        var delivery=service().prepare(id); assertNotNull(delivery); service().mark(id,"ACCEPTED"); return delivery;
    }
    ErrorCode failure(Runnable r) { return assertThrows(BusinessException.class,r::run).getErrorCode(); }
    boolean verified(Account a) { return jdbc.queryForObject("SELECT email_verified_at FROM dbo.users WHERE user_id=?",java.sql.Timestamp.class,a.id())!=null; }
    String jwt(Account a) { return context.getBean(AuthService.class).login(new LoginRequest(a.email(),PASSWORD)).accessToken(); }

    @Test void validCredentialVerifiesOnceAndReplayFails() {
        var a=account(); var d=issue(a);
        assertFalse(verified(a));
        service().verify(d.credential());
        assertTrue(verified(a));
        assertEquals(1,count("email_verification_credentials","user_id="+a.id()+" AND consumed_at IS NOT NULL"));
        assertEquals(ErrorCode.EMAIL_VERIFICATION_INVALID,failure(()->service().verify(d.credential())));
        assertEquals(1,count("audit_logs","entity_id="+a.id()+" AND action='AUTH_EMAIL_VERIFIED'"));
    }
    @Test void wrongOrMalformedCredentialIsRejectedWithoutSideEffects() {
        var a=account(); issue(a);
        assertEquals(ErrorCode.EMAIL_VERIFICATION_INVALID,failure(()->service().verify(secrets().generate())));
        for(String bad:List.of("","short","!".repeat(43),"A".repeat(44)))
            assertEquals(ErrorCode.EMAIL_VERIFICATION_INVALID,failure(()->service().verify(bad)));
        assertFalse(verified(a));
    }
    @Test void expiredCredentialIsRejected() {
        var a=account(); var d=issue(a);
        jdbc.update("UPDATE dbo.email_verification_credentials SET created_at=DATEADD(hour,-2,SYSUTCDATETIME()),expires_at=DATEADD(hour,-1,SYSUTCDATETIME()) WHERE user_id=?",a.id());
        assertEquals(ErrorCode.EMAIL_VERIFICATION_INVALID,failure(()->service().verify(d.credential())));
        assertFalse(verified(a));
    }
    @Test void resendRevokesOlderGenerationWhenConfiguredAndIncrementsGeneration() {
        var a=account(); var first=issue(a); var second=issue(a);
        assertEquals(List.of(1,2),jdbc.queryForList("SELECT generation FROM dbo.email_verification_credentials WHERE user_id=? ORDER BY generation",Integer.class,a.id()));
        assertEquals(1,count("email_verification_credentials","user_id="+a.id()+" AND revoked_at IS NOT NULL"));
        assertEquals(ErrorCode.EMAIL_VERIFICATION_INVALID,failure(()->service().verify(first.credential())));
        service().verify(second.credential()); assertTrue(verified(a));
    }
    @Test void credentialOnlyVerifiesItsOwnAccount() {
        var a=account(); var b=account(); var d=issue(a);
        service().verify(d.credential());
        assertTrue(verified(a)); assertFalse(verified(b));
    }
    @Test void changingEmailInvalidatesCredentialAndNewAddressStartsUnverified() {
        var a=account(); var d=issue(a);
        jdbc.update("UPDATE dbo.users SET email=? WHERE user_id=?",UUID.randomUUID()+"@example.test",a.id());
        assertEquals(ErrorCode.EMAIL_VERIFICATION_INVALID,failure(()->service().verify(d.credential())));
        assertFalse(verified(a));
        var fresh=issue(a); service().verify(fresh.credential()); assertTrue(verified(a));
    }
    @Test void jobQueuedBeforeEmailChangeMintsNoCredential() {
        var a=account();
        assertEquals(EmailVerificationService.Outcome.QUEUED,service().enqueue(a.id(),"vi"));
        jdbc.update("UPDATE dbo.users SET email=? WHERE user_id=?",UUID.randomUUID()+"@example.test",a.id());
        Long id=service().claim(); assertNotNull(id);
        assertNull(service().prepare(id));
        assertEquals(0,count("email_verification_credentials","user_id="+a.id()));
    }
    @Test void passwordRecoveryAndEmailVerificationCredentialsAreNotInterchangeable() {
        var a=account(); var verification=issue(a);
        var recovery=context.getBean(PasswordRecoveryService.class);
        assertEquals(ErrorCode.RECOVERY_INVALID,failure(()->recovery.reset(verification.credential(),"New-password-456")));
        recovery.enqueue(a.email(),"en"); Long job=recovery.claim(); var reset=recovery.prepare(job); recovery.mark(job,"ACCEPTED");
        assertNotNull(reset);
        assertEquals(ErrorCode.EMAIL_VERIFICATION_INVALID,failure(()->service().verify(reset.credential())));
        assertFalse(verified(a));
    }
    @Test void simultaneousConsumeHasExactlyOneWinner() throws Exception {
        for(int round=0;round<3;round++) {
            var a=account(); String credential=issue(a).credential();
            try(var pool=Executors.newFixedThreadPool(2)) {
                var start=new CountDownLatch(1);
                Callable<Boolean> attempt=()->{ start.await(); try { service().verify(credential); return true; } catch(BusinessException e) { return false; } };
                var futures=List.of(pool.submit(attempt),pool.submit(attempt));
                start.countDown(); int wins=0;
                for(var f:futures) if(f.get(20,TimeUnit.SECONDS)) wins++;
                assertEquals(1,wins);
            }
            assertTrue(verified(a));
        }
    }
    @Test void lockedOrDeletedAccountCannotRequestOrConfirm() {
        var locked=account(); var lockedCredential=issue(locked).credential();
        jdbc.update("UPDATE dbo.users SET status='LOCKED' WHERE user_id=?",locked.id());
        assertEquals(ErrorCode.EMAIL_VERIFICATION_INVALID,failure(()->service().verify(lockedCredential)));
        assertEquals(ErrorCode.UNAUTHENTICATED,failure(()->service().enqueue(locked.id(),"en")));
        var deleted=account(); var deletedCredential=issue(deleted).credential();
        jdbc.update("UPDATE dbo.users SET deleted_at=SYSUTCDATETIME() WHERE user_id=?",deleted.id());
        assertEquals(ErrorCode.EMAIL_VERIFICATION_INVALID,failure(()->service().verify(deletedCredential)));
        assertFalse(verified(locked)); assertFalse(verified(deleted));
    }
    @Test void accountWithoutPasswordLoginAndAlreadyVerifiedAccountsAreNotQueued() {
        var google=account(false);
        assertEquals(EmailVerificationService.Outcome.NOT_APPLICABLE,service().enqueue(google.id(),"en"));
        assertEquals(0,count("email_verification_jobs","user_id="+google.id()));
        var done=account(); service().verify(issue(done).credential());
        assertEquals(EmailVerificationService.Outcome.ALREADY_VERIFIED,service().enqueue(done.id(),"en"));
        assertEquals(1,count("email_verification_jobs","user_id="+done.id()));
    }
    @Test void failedConsumeRollsBackCredentialAndVerification() {
        var a=account(); var d=issue(a);
        jdbc.execute("CREATE TRIGGER dbo.TR_ev_fail_"+a.id()+" ON dbo.users AFTER UPDATE AS IF UPDATE(email_verified_at) "
                +"AND EXISTS(SELECT 1 FROM inserted WHERE user_id="+a.id()+" AND email_verified_at IS NOT NULL) THROW 51000,'forced',1;");
        try {
            assertThrows(RuntimeException.class,()->service().verify(d.credential()));
        } finally { jdbc.execute("DROP TRIGGER dbo.TR_ev_fail_"+a.id()); }
        assertFalse(verified(a));
        assertEquals(0,count("email_verification_credentials","user_id="+a.id()+" AND consumed_at IS NOT NULL"));
        service().verify(d.credential()); assertTrue(verified(a));
    }
    @Test void providerFailureIsFailedNotAcceptedAndRawCredentialIsNeverStored() {
        var a=account();
        assertEquals(EmailVerificationService.Outcome.QUEUED,service().enqueue(a.id(),"en"));
        var seen=new ArrayList<String>();
        new EmailVerificationDeliveryWorker(service(),(to,locale,credential)->{ seen.add(credential); throw new IllegalStateException("provider down"); }).deliver();
        assertEquals(1,seen.size());
        assertEquals("FAILED",jdbc.queryForObject("SELECT status FROM dbo.email_verification_jobs WHERE user_id=?",String.class,a.id()));
        assertEquals("FAILED",service().status(a.id()).lastRequestState());
        // Hash only: neither table contains the raw value, and the delivery object redacts it.
        assertEquals(0,count("email_verification_credentials","credential_hash='"+seen.getFirst()+"'"));
        assertEquals(0,count("audit_logs","details LIKE '%"+seen.getFirst()+"%'"));
        assertEquals(secrets().hash(seen.getFirst()),jdbc.queryForObject("SELECT credential_hash FROM dbo.email_verification_credentials WHERE user_id=?",String.class,a.id()));
        assertFalse(new EmailVerificationService.Delivery(1L,a.email(),"en",seen.getFirst()).toString().contains(seen.getFirst()));
    }
    @Test void providerAcceptanceIsReportedOnlyAfterTheTransportReturns() {
        var a=account();
        service().enqueue(a.id(),"en");
        assertEquals("QUEUED",service().status(a.id()).lastRequestState());
        new EmailVerificationDeliveryWorker(service(),(to,locale,credential)->{ }).deliver();
        assertEquals("PROVIDER_ACCEPTED",service().status(a.id()).lastRequestState());
    }
    @Test void httpRequestsAreRateLimitedAndStatusIsReadOnlyForTheCaller() throws Exception {
        configure(true,List.of(new EmailVerificationConfiguration.Limit(1,3600)),LOOSE_CONFIRM);
        var a=account(); String token="Bearer "+jwt(a); var mvc=mvc();
        var status=mvc.perform(get("/api/v1/auth/email-verification").header("Authorization",token)).andReturn().getResponse();
        assertEquals(200,status.getStatus()); assertTrue(status.getContentAsString().contains("\"verified\":false"));
        assertEquals(202,mvc.perform(post("/api/v1/auth/email-verification/requests").header("Authorization",token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"locale\":\"en\"}")).andReturn().getResponse().getStatus());
        var limited=mvc.perform(post("/api/v1/auth/email-verification/requests").header("Authorization",token)).andReturn().getResponse();
        assertEquals(429,limited.getStatus()); assertTrue(limited.getContentAsString().contains("RATE_LIMITED"));
        assertEquals(401,mvc.perform(get("/api/v1/auth/email-verification")).andReturn().getResponse().getStatus());
        assertEquals(401,mvc.perform(post("/api/v1/auth/email-verification/requests")).andReturn().getResponse().getStatus());
    }
    @Test void requestIsUnavailableUntilDeliveryIsEnabled() throws Exception {
        notReady();
        var a=account(); String token="Bearer "+jwt(a); var mvc=mvc();
        var response=mvc.perform(post("/api/v1/auth/email-verification/requests").header("Authorization",token)).andReturn().getResponse();
        assertEquals(503,response.getStatus()); assertTrue(response.getContentAsString().contains("EMAIL_VERIFICATION_UNAVAILABLE"));
        assertEquals(0,count("email_verification_jobs","user_id="+a.id()));
        assertTrue(mvc.perform(get("/api/v1/auth/email-verification").header("Authorization",token)).andReturn().getResponse()
                .getContentAsString().contains("\"requestAvailable\":false"));
    }
    @Test void confirmIsPublicAndGivesOneIndistinguishableErrorForUnknownUsedAndExpired() throws Exception {
        var a=account(); var used=issue(a).credential(); service().verify(used);
        var b=account(); var expired=issue(b).credential();
        jdbc.update("UPDATE dbo.email_verification_credentials SET created_at=DATEADD(hour,-2,SYSUTCDATETIME()),expires_at=DATEADD(hour,-1,SYSUTCDATETIME()) WHERE user_id=?",b.id());
        var mvc=mvc(); Set<String> shapes=new HashSet<>();
        for(String credential:List.of(secrets().generate(),used,expired)) {
            var r=mvc.perform(post("/api/v1/auth/email-verification/confirm").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"credential\":\""+credential+"\"}")).andReturn().getResponse();
            assertEquals(400,r.getStatus()); assertTrue(r.getContentAsString().contains("EMAIL_VERIFICATION_INVALID"));
            shapes.add(r.getStatus()+r.getContentType());
        }
        assertEquals(1,shapes.size());
        var c=account(); var good=issue(c).credential();
        assertEquals(204,mvc.perform(post("/api/v1/auth/email-verification/confirm").contentType(MediaType.APPLICATION_JSON)
                .content("{\"credential\":\""+good+"\"}")).andReturn().getResponse().getStatus());
        assertTrue(verified(c));
    }

    @Test void approvedCooldownRefusesAnImmediateResendButAccountsAreIndependent() throws Exception {
        approvedLimits();
        var a=account(); var b=account(); var mvc=mvc();
        String tokenA="Bearer "+jwt(a), tokenB="Bearer "+jwt(b);
        assertEquals(202,mvc.perform(post("/api/v1/auth/email-verification/requests").header("Authorization",tokenA)).andReturn().getResponse().getStatus());
        assertEquals(429,mvc.perform(post("/api/v1/auth/email-verification/requests").header("Authorization",tokenA)).andReturn().getResponse().getStatus());
        assertEquals(1,count("email_verification_jobs","user_id="+a.id()));
        assertEquals(202,mvc.perform(post("/api/v1/auth/email-verification/requests").header("Authorization",tokenB)).andReturn().getResponse().getStatus());
    }
    @Test void wrongConfirmAttemptsAreLimitedPerIpWithoutRevealingAnything() throws Exception {
        configure(true,List.of(LOOSE_SEND),new EmailVerificationConfiguration.Limit(2,900));
        var mvc=mvc(); String ip="10.77."+(int)(Math.random()*200)+"."+(int)(Math.random()*200);
        List<Integer> statuses=new ArrayList<>();
        for(int i=0;i<3;i++) statuses.add(mvc.perform(post("/api/v1/auth/email-verification/confirm").contentType(MediaType.APPLICATION_JSON)
                .content("{\"credential\":\""+secrets().generate()+"\"}").with(r->{ r.setRemoteAddr(ip); return r; })).andReturn().getResponse().getStatus());
        assertEquals(List.of(400,400,429),statuses);
    }
    @Test void emailChangeRevokesOpenCredentialsDropsQueuedJobsAndLeavesAccountUnverified() throws Exception {
        var a=account(); var d=issue(a);
        service().enqueue(a.id(),"en"); // a second job waiting for a worker
        var response=mvc().perform(patch("/api/v1/auth/me").header("Authorization","Bearer "+jwt(a)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\""+UUID.randomUUID()+"@example.test\",\"currentPassword\":\""+PASSWORD+"\"}")).andReturn().getResponse();
        assertEquals(200,response.getStatus(),response.getContentAsString());
        assertEquals(1,count("email_verification_credentials","user_id="+a.id()+" AND revoked_at IS NOT NULL"));
        assertEquals(0,count("email_verification_jobs","user_id="+a.id()+" AND status='QUEUED'"));
        assertEquals(ErrorCode.EMAIL_VERIFICATION_INVALID,failure(()->service().verify(d.credential())));
        assertFalse(verified(a));
        // Nothing was sent automatically for the new address; the user must ask again.
        assertEquals(1,count("email_verification_jobs","user_id="+a.id()+" AND status='ACCEPTED'"));
        assertEquals(0,count("email_verification_credentials","user_id="+a.id()+" AND revoked_at IS NULL"));
    }
    @Test void onlyTheNewestGenerationCanBeConsumedEvenIfAnOlderOneWasNotRevoked() {
        var a=account(); var first=issue(a); var second=issue(a);
        jdbc.update("UPDATE dbo.email_verification_credentials SET revoked_at=NULL WHERE user_id=? AND generation=1",a.id());
        assertEquals(ErrorCode.EMAIL_VERIFICATION_INVALID,failure(()->service().verify(first.credential())));
        service().verify(second.credential()); assertTrue(verified(a));
    }

    int count(String table,String where) { return jdbc.queryForObject("SELECT COUNT(*) FROM dbo."+table+" WHERE "+where,Integer.class); }
}
