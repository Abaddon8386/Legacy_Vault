package com.legacyvault.auth.recovery;

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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PasswordRecoveryService {
    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final EntityManager entities;
    private final PasswordEncoder encoder;
    private final RecoverySecrets secrets;
    private final AuditService audit;
    public PasswordRecoveryService(JdbcTemplate jdbc, UserRepository users, EntityManager entities,
            PasswordEncoder encoder, RecoverySecrets secrets, AuditService audit) {
        this.jdbc=jdbc; this.users=users; this.entities=entities; this.encoder=encoder; this.secrets=secrets; this.audit=audit;
    }
    @Transactional
    public void enqueue(String email, String locale) {
        // Queue all well-formed addresses, including unknown/ineligible users. No account-dependent response.
        jdbc.update("INSERT dbo.password_recovery_jobs(email,locale,requested_at) VALUES (?,?,SYSUTCDATETIME())",
                EmailNormalizer.normalize(email),"en".equals(locale)?"en":"vi");
    }
    @Transactional
    public Long claim() {
        var ids=jdbc.query("""
                ;WITH next_job AS (SELECT TOP (1) * FROM dbo.password_recovery_jobs WITH (UPDLOCK,READPAST,READCOMMITTEDLOCK)
                    WHERE status='QUEUED' ORDER BY job_id)
                UPDATE next_job SET status='CLAIMED' OUTPUT inserted.job_id
                """,(rs,n)->rs.getLong(1));
        return ids.isEmpty()?null:ids.getFirst();
    }
    @Transactional
    public Delivery prepare(Long jobId) {
        // Lock order: Job -> User -> Credential. Reset takes User -> Credential and never locks a Job.
        // Claim alone is not a one-time prepare guard: a repeated caller must not mint a second secret.
        var jobs=jdbc.query("UPDATE dbo.password_recovery_jobs SET status='PREPARED' OUTPUT inserted.email,inserted.locale,inserted.requested_at WHERE job_id=? AND status='CLAIMED'",
                (rs,n)->new Job(rs.getString(1),rs.getString(2),rs.getObject(3,LocalDateTime.class)),jobId);
        if(jobs.isEmpty()) return null;
        Job job=jobs.getFirst();
        if(job.requestedAt().isBefore(now().minusMinutes(15))) { mark(jobId,"SKIPPED"); return null; }
        User candidate=users.findByEmail(job.email()).orElse(null);
        if(candidate==null) { mark(jobId,"SKIPPED"); return null; }
        User user=users.findActiveAccountForUpdate(candidate.getUserId()).orElse(null);
        if(user==null) { mark(jobId,"SKIPPED"); return null; }
        entities.refresh(user); // The lookup above may have populated JPA before waiting for the User lock.
        if(!eligible(user) || !job.email().equals(EmailNormalizer.normalize(user.getEmail()))
                || (user.getPasswordResetAt()!=null && !job.requestedAt().isAfter(user.getPasswordResetAt()))) {
            mark(jobId,"SKIPPED"); return null;
        }
        LocalDateTime now=now();
        Long active=jdbc.queryForObject("SELECT COUNT_BIG(*) FROM dbo.password_reset_credentials WHERE user_id=? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>?",Long.class,user.getUserId(),now);
        if(active!=null && active>=3) { mark(jobId,"SKIPPED"); return null; }
        String raw=secrets.generate();
        jdbc.update("INSERT dbo.password_reset_credentials(user_id,credential_hash,auth_version,created_at,expires_at,email_fingerprint) VALUES (?,?,?,?,?,?)",
                user.getUserId(),secrets.hash(raw),user.getAuthVersion(),now,now.plusMinutes(15),emailFingerprint(user));
        record(user,AuditAction.AUTH_RECOVERY_ISSUED);
        return new Delivery(jobId,user.getEmail(),job.locale(),raw);
    }
    @Transactional
    public void mark(Long jobId,String status) {
        if(!java.util.Set.of("ACCEPTED","FAILED","SKIPPED").contains(status))
            throw new IllegalArgumentException("Invalid recovery job transition");
        jdbc.update("UPDATE dbo.password_recovery_jobs SET status=? WHERE job_id=? AND status IN ('CLAIMED','PREPARED')",status,jobId);
    }
    @Transactional
    public void cleanup() {
        LocalDateTime now=now();
        jdbc.update("DELETE dbo.password_recovery_limits WHERE occurred_at<?",now.minusDays(1));
        jdbc.update("DELETE dbo.password_recovery_jobs WHERE requested_at<?",now.minusDays(1));
        jdbc.update("DELETE dbo.password_reset_credentials WHERE expires_at<?",now.minusDays(7));
    }
    @Transactional
    public void reset(String credential,String password) {
        if(!new com.legacyvault.auth.policy.PasswordPolicy().isValid(password,null))
            throw new BusinessException(ErrorCode.PASSWORD_POLICY);
        if(!secrets.valid(credential)) throw invalid();
        String hash=secrets.hash(credential);
        var ids=jdbc.query("SELECT user_id FROM dbo.password_reset_credentials WHERE credential_hash=?",(r,n)->r.getLong(1),hash);
        if(ids.isEmpty()) throw invalid();
        // Every writer takes User first. Reset does not lock Vault or change roles/provider mappings.
        User user=users.findActiveAccountForUpdate(ids.getFirst()).orElseThrow(this::invalid);
        entities.refresh(user);
        if(!eligible(user)) throw invalid();
        Long usable=jdbc.queryForObject("""
                SELECT COUNT_BIG(*) FROM dbo.password_reset_credentials WHERE credential_hash=? AND user_id=?
                AND auth_version=? AND email_fingerprint=? AND purpose='PASSWORD_RESET' AND consumed_at IS NULL AND revoked_at IS NULL
                AND expires_at>SYSUTCDATETIME()
                """,Long.class,hash,user.getUserId(),user.getAuthVersion(),emailFingerprint(user));
        if(usable==null || usable!=1) throw invalid();
        // Hash before taking the final expiry timestamp: an expensive encode must not extend token validity.
        String encoded=encoder.encode(password);
        LocalDateTime at=now();
        int changed=jdbc.update("""
                UPDATE dbo.password_reset_credentials SET consumed_at=?
                WHERE credential_hash=? AND user_id=? AND purpose='PASSWORD_RESET' AND auth_version=? AND email_fingerprint=?
                    AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>?
                """,at,hash,user.getUserId(),user.getAuthVersion(),emailFingerprint(user),at);
        if(changed!=1) throw invalid();
        user.setPasswordHash(encoded);
        user.advanceAuthVersion(at);
        users.saveAndFlush(user);
        jdbc.update("UPDATE dbo.password_reset_credentials SET revoked_at=? WHERE user_id=? AND consumed_at IS NULL AND revoked_at IS NULL",at,user.getUserId());
        record(user,AuditAction.AUTH_PASSWORD_RESET);
    }
    private boolean eligible(User u) { return "ACTIVE".equals(u.getStatus()) && u.getDeletedAt()==null && u.isPasswordLoginEnabled(); }
    private String emailFingerprint(User user) { return secrets.bucket("reset-email",EmailNormalizer.normalize(user.getEmail())); }
    private BusinessException invalid() { return new BusinessException(ErrorCode.RECOVERY_INVALID); }
    private LocalDateTime now() { return jdbc.queryForObject("SELECT SYSUTCDATETIME()",(rs,n)->rs.getObject(1,LocalDateTime.class)); }
    private void record(User user,AuditAction action) {
        boolean issued=action==AuditAction.AUTH_RECOVERY_ISSUED;
        audit.record(new AuditEvent(action,issued?AuditActorType.SYSTEM:AuditActorType.USER,issued?null:user.getUserId(),null,"USER",user.getUserId(),
                null,null,null,Map.of("result","SUCCESS"),"AUTH_RECOVERY",null));
    }
    private record Job(String email,String locale,LocalDateTime requestedAt) {
        @Override public String toString() { return "RecoveryJob[redacted]"; }
    }
    public record Delivery(Long jobId,String email,String locale,String credential) {
        @Override public String toString() { return "RecoveryDelivery[redacted]"; }
    }
}
