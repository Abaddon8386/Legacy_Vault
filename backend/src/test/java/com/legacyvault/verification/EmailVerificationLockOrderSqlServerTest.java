package com.legacyvault.verification;

import com.legacyvault.auth.*;
import com.legacyvault.auth.dto.ProfileUpdateRequest;
import com.legacyvault.auth.emailverification.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Lock-order regression on real SQL Server: the delivery worker (prepare) and an email change must both take
 * User -> Job -> Credential. A trigger on the credential table holds the email change (already owning the
 * User lock) for a moment, so the old Job -> User order in prepare deadlocks (error 1205) deterministically
 * instead of once in a blue moon.
 */
class EmailVerificationLockOrderSqlServerTest extends LegalBasisSqlServerSupport {
    static final String PASSWORD="Old-password-123";
    record Account(long id,UUID publicId,String email) { }

    EmailVerificationService service() { return context.getBean(EmailVerificationService.class); }
    AuthService auth() { return context.getBean(AuthService.class); }

    @BeforeEach void ready() {
        var c=context.getBean(EmailVerificationConfiguration.class);
        ReflectionTestUtils.setField(c,"deliveryEnabled",true); ReflectionTestUtils.setField(c,"ttlMinutes",30);
        jdbc.update("UPDATE dbo.email_verification_jobs SET status='SKIPPED' WHERE status IN ('QUEUED','CLAIMED','PREPARED')");
    }
    @AfterEach void notReady() { ReflectionTestUtils.setField(context.getBean(EmailVerificationConfiguration.class),"deliveryEnabled",false); }

    Account account() {
        UUID id=UUID.randomUUID(); String email=id+"@example.test";
        long key=jdbc.queryForObject("INSERT dbo.users(public_id,full_name,email,password_hash,status,password_login_enabled) OUTPUT inserted.user_id VALUES (?,'Lock fixture',?,?,'ACTIVE',1)",
                Long.class,id.toString(),email,context.getBean(PasswordEncoder.class).encode(PASSWORD));
        jdbc.update("INSERT dbo.user_roles(user_id,role_id) SELECT ?,role_id FROM dbo.roles WHERE role_code='ROLE_VAULT_OWNER'",key);
        return new Account(key,id,email);
    }
    Long queueAndClaim(Account a) {
        assertEquals(EmailVerificationService.Outcome.QUEUED,service().enqueue(a.id(),"en"));
        Long job=service().claim(); assertNotNull(job); return job;
    }
    void changeEmail(Account a) {
        var principal=new CustomUserPrincipal(a.id(),a.publicId(),a.email());
        var request=new ProfileUpdateRequest(); request.setEmail(UUID.randomUUID()+"@example.test"); request.setCurrentPassword(PASSWORD);
        auth().updateCurrentUser(new UsernamePasswordAuthenticationToken(principal,null,List.of()),request);
    }
    /** Worker side exactly as EmailVerificationDeliveryWorker drives it, with a transport that always succeeds. */
    boolean workerFlow(Long job) {
        var delivery=service().prepare(job);
        if(delivery==null) return false;
        service().mark(job,"ACCEPTED"); return true;
    }
    int count(String table,String where) { return jdbc.queryForObject("SELECT COUNT(*) FROM dbo."+table+" WHERE "+where,Integer.class); }

    /** Runs both sides together; returns [workerResult, changeEmailResult] and fails on any exception, deadlock included. */
    void runTogether(Callable<Object> first,Callable<Object> second,long secondDelayMillis) throws Exception {
        try(var pool=Executors.newFixedThreadPool(2)) {
            var start=new CountDownLatch(1);
            var a=pool.submit(()->{ start.await(); return first.call(); });
            var b=pool.submit(()->{ start.await(); Thread.sleep(secondDelayMillis); return second.call(); });
            start.countDown();
            for(var f:List.of(a,b)) {
                try { f.get(60,TimeUnit.SECONDS); }
                catch(ExecutionException e) { fail("Concurrent flow failed (SQL error 1205 means a lock-order deadlock): "+rootMessage(e),e); }
            }
        }
    }
    static String rootMessage(Throwable t) { while(t.getCause()!=null) t=t.getCause(); return t.getClass().getSimpleName()+": "+t.getMessage(); }

    @Test void workerAndEmailChangeNeverDeadlockWhileTheEmailChangeHoldsTheUserLock() throws Exception {
        for(int round=0;round<4;round++) {
            var a=account(); Long job=queueAndClaim(a);
            // An open credential for the old address, so the email change's revoke really updates a row.
            jdbc.update("INSERT dbo.email_verification_credentials(user_id,credential_hash,email_fingerprint,generation,created_at,expires_at) "
                    +"VALUES (?,?,?,1,SYSUTCDATETIME(),DATEADD(hour,1,SYSUTCDATETIME()))",a.id(),"c".repeat(63)+round,"d".repeat(64));
            String trigger="dbo.TR_ev_slow_"+a.id();
            // The email change owns the User lock when it revokes credentials; hold it there while the worker arrives.
            jdbc.execute("CREATE TRIGGER "+trigger+" ON dbo.email_verification_credentials AFTER UPDATE AS "
                    +"IF EXISTS(SELECT 1 FROM inserted WHERE user_id="+a.id()+") WAITFOR DELAY '00:00:00.500';");
            try {
                runTogether(()->{ changeEmail(a); return null; },()->workerFlow(job),150);
            } finally { jdbc.execute("DROP TRIGGER "+trigger); }
            assertEmailChangeConsistent(a);
        }
    }

    @Test void repeatedUnsynchronisedRacesLeaveConsistentStateAndNeverFailTheJob() throws Exception {
        for(int round=0;round<12;round++) {
            var a=account(); Long job=queueAndClaim(a);
            runTogether(()->workerFlow(job),()->{ changeEmail(a); return null; },round%4*15L);
            assertEmailChangeConsistent(a);
        }
    }

    @Test void twoWorkersPreparingTheSameClaimedJobProduceExactlyOneCredential() throws Exception {
        for(int round=0;round<4;round++) {
            var a=account(); Long job=queueAndClaim(a);
            try(var pool=Executors.newFixedThreadPool(2)) {
                var start=new CountDownLatch(1);
                Callable<Boolean> attempt=()->{ start.await(); return service().prepare(job)!=null; };
                var futures=List.of(pool.submit(attempt),pool.submit(attempt));
                start.countDown(); int winners=0;
                for(var f:futures) if(f.get(60,TimeUnit.SECONDS)) winners++;
                assertEquals(1,winners);
            }
            assertEquals(1,count("email_verification_credentials","user_id="+a.id()));
            assertEquals("PREPARED",jdbc.queryForObject("SELECT status FROM dbo.email_verification_jobs WHERE job_id=?",String.class,job));
        }
    }

    @Test void aJobSkippedByAnEmailChangeWhilePrepareWaitsIsNeverPreparedOrOverwritten() throws Exception {
        var a=account(); Long job=queueAndClaim(a);
        // Email change first, worker second: the worker must find nothing to do and leave SKIPPED alone.
        changeEmail(a);
        assertNull(service().prepare(job));
        assertEquals("SKIPPED",jdbc.queryForObject("SELECT status FROM dbo.email_verification_jobs WHERE job_id=?",String.class,job));
        service().mark(job,"FAILED");
        assertEquals("SKIPPED",jdbc.queryForObject("SELECT status FROM dbo.email_verification_jobs WHERE job_id=?",String.class,job));
        assertEquals(0,count("email_verification_credentials","user_id="+a.id()));
    }

    /** Whatever the interleaving: old-address proof is gone, nothing live is bound to it, the job was not failed. */
    void assertEmailChangeConsistent(Account a) {
        assertNotEquals(a.email(),jdbc.queryForObject("SELECT email FROM dbo.users WHERE user_id=?",String.class,a.id()));
        assertNull(jdbc.queryForObject("SELECT email_verified_at FROM dbo.users WHERE user_id=?",java.sql.Timestamp.class,a.id()));
        assertEquals(0,count("email_verification_credentials","user_id="+a.id()+" AND consumed_at IS NULL AND revoked_at IS NULL"));
        assertTrue(count("email_verification_credentials","user_id="+a.id())<=2);
        assertEquals(1,count("email_verification_jobs","user_id="+a.id()));
        String status=jdbc.queryForObject("SELECT status FROM dbo.email_verification_jobs WHERE user_id=?",String.class,a.id());
        assertTrue(Set.of("SKIPPED","ACCEPTED").contains(status),"unexpected job status "+status);
    }
}
