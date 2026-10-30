package com.legacyvault.auth.emailverification;

import java.time.LocalDateTime;
import java.util.Map;
import com.legacyvault.audit.*;
import com.legacyvault.auth.EmailNormalizer;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import jakarta.persistence.EntityManager;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Email-ownership verification. The account is always taken from the authenticated principal (request)
 * or from the credential itself (confirm); a client never names the account or supplies a verified flag.
 * Lock order everywhere: User -> Credential. A job is only ever locked by claim/prepare, before the User.
 */
@Service
public class EmailVerificationService {
    public enum Outcome { QUEUED, ALREADY_VERIFIED, NOT_APPLICABLE }

    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final EntityManager entities;
    private final EmailVerificationSecrets secrets;
    private final EmailVerificationConfiguration config;
    private final AuditService audit;
    public EmailVerificationService(JdbcTemplate jdbc, UserRepository users, EntityManager entities,
            EmailVerificationSecrets secrets, EmailVerificationConfiguration config, AuditService audit) {
        this.jdbc=jdbc; this.users=users; this.entities=entities; this.secrets=secrets; this.config=config; this.audit=audit;
    }

    @Transactional(readOnly=true)
    public Status status(Long userId) {
        User user=users.findById(userId).orElseThrow(()->new BusinessException(ErrorCode.UNAUTHENTICATED));
        var last=jdbc.query("SELECT TOP (1) status,requested_at FROM dbo.email_verification_jobs WHERE user_id=? ORDER BY job_id DESC",
                (rs,n)->new Last(deliveryState(rs.getString(1)),rs.getObject(2,LocalDateTime.class)),userId);
        boolean available=user.getEmailVerifiedAt()==null && eligible(user) && config.ready();
        return new Status(user.getEmailVerifiedAt()!=null,user.getEmailVerifiedAt(),available,
                last.isEmpty()?null:last.getFirst().state(),last.isEmpty()?null:last.getFirst().at());
    }

    /** Queues a delivery job for the caller's current email. First request and resend are the same operation. */
    @Transactional
    public Outcome enqueue(Long userId,String locale) {
        User user=users.findActiveAccountForUpdate(userId).orElseThrow(()->new BusinessException(ErrorCode.UNAUTHENTICATED));
        entities.refresh(user);
        if(user.getEmailVerifiedAt()!=null) return Outcome.ALREADY_VERIFIED;
        if(!eligible(user)) return Outcome.NOT_APPLICABLE;
        jdbc.update("INSERT dbo.email_verification_jobs(user_id,email_fingerprint,locale,requested_at) VALUES (?,?,?,SYSUTCDATETIME())",
                userId,fingerprint(user),"en".equals(locale)?"en":"vi");
        return Outcome.QUEUED;
    }

    @Transactional
    public Long claim() {
        var ids=jdbc.query("""
                ;WITH next_job AS (SELECT TOP (1) * FROM dbo.email_verification_jobs WITH (UPDLOCK,READPAST,READCOMMITTEDLOCK)
                    WHERE status='QUEUED' ORDER BY job_id)
                UPDATE next_job SET status='CLAIMED' OUTPUT inserted.job_id
                """,(rs,n)->rs.getLong(1));
        return ids.isEmpty()?null:ids.getFirst();
    }

    /** Mints the credential for a claimed job exactly once; the raw value exists only in the returned Delivery. */
    @Transactional
    public Delivery prepare(Long jobId) {
        var jobs=jdbc.query("UPDATE dbo.email_verification_jobs SET status='PREPARED' OUTPUT inserted.user_id,inserted.email_fingerprint,inserted.locale,inserted.requested_at WHERE job_id=? AND status='CLAIMED'",
                (rs,n)->new Job(rs.getLong(1),rs.getString(2),rs.getString(3),rs.getObject(4,LocalDateTime.class)),jobId);
        if(jobs.isEmpty()) return null;
        Job job=jobs.getFirst();
        if(!config.ready()) { mark(jobId,"SKIPPED"); return null; }
        // A job older than one credential lifetime is stale: the worker may have been off for a long time.
        if(job.requestedAt().isBefore(now().minusMinutes(config.ttlMinutes()))) { mark(jobId,"SKIPPED"); return null; }
        User user=users.findActiveAccountForUpdate(job.userId()).orElse(null);
        if(user==null) { mark(jobId,"SKIPPED"); return null; }
        entities.refresh(user);
        if(user.getEmailVerifiedAt()!=null || !eligible(user) || !job.fingerprint().equals(fingerprint(user))) {
            mark(jobId,"SKIPPED"); return null;
        }
        LocalDateTime now=now();
        // Resend supersedes: only the newest generation can ever be consumed.
        jdbc.update("UPDATE dbo.email_verification_credentials SET revoked_at=? WHERE user_id=? AND consumed_at IS NULL AND revoked_at IS NULL",now,user.getUserId());
        Integer generation=jdbc.queryForObject("SELECT ISNULL(MAX(generation),0)+1 FROM dbo.email_verification_credentials WHERE user_id=?",Integer.class,user.getUserId());
        String raw=secrets.generate();
        jdbc.update("INSERT dbo.email_verification_credentials(user_id,credential_hash,email_fingerprint,generation,created_at,expires_at) VALUES (?,?,?,?,?,?)",
                user.getUserId(),secrets.hash(raw),fingerprint(user),generation,now,now.plusMinutes(config.ttlMinutes()));
        record(user,AuditAction.AUTH_EMAIL_VERIFICATION_ISSUED);
        return new Delivery(jobId,user.getEmail(),job.locale(),raw);
    }

    @Transactional
    public void mark(Long jobId,String status) {
        if(!java.util.Set.of("ACCEPTED","FAILED","SKIPPED").contains(status))
            throw new IllegalArgumentException("Invalid email verification job transition");
        jdbc.update("UPDATE dbo.email_verification_jobs SET status=? WHERE job_id=? AND status IN ('CLAIMED','PREPARED')",status,jobId);
    }

    /** Consumes the credential and records email_verified_at in one transaction; any failure rolls both back. */
    @Transactional
    public void verify(String credential) {
        if(!secrets.valid(credential)) throw invalid();
        String hash=secrets.hash(credential);
        var ids=jdbc.query("SELECT user_id FROM dbo.email_verification_credentials WHERE credential_hash=?",(r,n)->r.getLong(1),hash);
        if(ids.isEmpty()) throw invalid();
        User user=users.findActiveAccountForUpdate(ids.getFirst()).orElseThrow(this::invalid);
        entities.refresh(user); // The lookup may have populated JPA before the User lock was granted.
        if(!eligible(user) || user.getEmailVerifiedAt()!=null) throw invalid();
        LocalDateTime at=now();
        int changed=jdbc.update("""
                UPDATE dbo.email_verification_credentials SET consumed_at=?
                WHERE credential_hash=? AND user_id=? AND purpose='EMAIL_VERIFICATION' AND email_fingerprint=?
                    AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>?
                    AND generation=(SELECT MAX(generation) FROM dbo.email_verification_credentials WHERE user_id=?)
                """,at,hash,user.getUserId(),fingerprint(user),at,user.getUserId());
        if(changed!=1) throw invalid();
        user.setEmailVerifiedAt(at);
        users.saveAndFlush(user);
        jdbc.update("UPDATE dbo.email_verification_credentials SET revoked_at=? WHERE user_id=? AND consumed_at IS NULL AND revoked_at IS NULL",at,user.getUserId());
        record(user,AuditAction.AUTH_EMAIL_VERIFIED);
    }

    /**
     * Called by AuthService inside the email-change transaction: open credentials die with the old address and
     * queued jobs for it are dropped. Nothing new is sent; the user must ask again.
     */
    @Transactional
    public void revokeForEmailChange(Long userId) {
        jdbc.update("UPDATE dbo.email_verification_credentials SET revoked_at=SYSUTCDATETIME() WHERE user_id=? AND consumed_at IS NULL AND revoked_at IS NULL",userId);
        jdbc.update("UPDATE dbo.email_verification_jobs SET status='SKIPPED' WHERE user_id=? AND status IN ('QUEUED','CLAIMED','PREPARED')",userId);
    }

    @Transactional
    public void cleanup() {
        LocalDateTime now=now();
        jdbc.update("DELETE dbo.email_verification_jobs WHERE requested_at<?",now.minusDays(1));
        jdbc.update("DELETE dbo.email_verification_credentials WHERE expires_at<?",now.minusDays(7));
    }

    // Only a password-registered account may prove its mailbox here; Google-only accounts are not touched (PS-85).
    private boolean eligible(User u) { return "ACTIVE".equals(u.getStatus()) && u.getDeletedAt()==null && u.isPasswordLoginEnabled(); }
    private String fingerprint(User user) { return secrets.emailFingerprint(EmailNormalizer.normalize(user.getEmail())); }
    private BusinessException invalid() { return new BusinessException(ErrorCode.EMAIL_VERIFICATION_INVALID); }
    private LocalDateTime now() { return jdbc.queryForObject("SELECT SYSUTCDATETIME()",(rs,n)->rs.getObject(1,LocalDateTime.class)); }
    private static String deliveryState(String jobStatus) {
        return switch(jobStatus) { case "ACCEPTED"->"PROVIDER_ACCEPTED"; case "FAILED"->"FAILED"; case "SKIPPED"->"SKIPPED"; default->"QUEUED"; };
    }
    private void record(User user,AuditAction action) {
        boolean issued=action==AuditAction.AUTH_EMAIL_VERIFICATION_ISSUED;
        audit.record(new AuditEvent(action,issued?AuditActorType.SYSTEM:AuditActorType.USER,issued?null:user.getUserId(),null,"USER",user.getUserId(),
                null,null,null,Map.of("result","SUCCESS"),"AUTH_EMAIL_VERIFICATION",null));
    }

    private record Job(Long userId,String fingerprint,String locale,LocalDateTime requestedAt) {
        @Override public String toString() { return "EmailVerificationJob[redacted]"; }
    }
    private record Last(String state,LocalDateTime at) { }
    public record Status(boolean verified,LocalDateTime verifiedAt,boolean requestAvailable,String lastRequestState,LocalDateTime lastRequestedAt) { }
    public record Delivery(Long jobId,String email,String locale,String credential) {
        @Override public String toString() { return "EmailVerificationDelivery[redacted]"; }
    }
}
