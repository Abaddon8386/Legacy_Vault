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

/**
 * Nghiệp vụ khôi phục mật khẩu. Dùng SQL trực tiếp trên các bảng {@code dbo.password_recovery_jobs} (hàng đợi gửi mail),
 * {@code dbo.password_reset_credentials} (mã một lần, lưu băm SHA-256) và {@code dbo.password_recovery_limits}; ghi audit
 * {@code AUTH_RECOVERY_ISSUED} / {@code AUTH_PASSWORD_RESET}. Được {@link PasswordRecoveryController} (enqueue, reset),
 * {@link RecoveryDeliveryWorker} (claim, prepare, mark) và {@link RecoveryMaintenance} (cleanup) gọi.
 * Thứ tự khóa: Job -> User -> Credential; reset khóa User -> Credential và không bao giờ khóa Job.
 */
@Service
public class PasswordRecoveryService {
    /**
     * Truy cập SQL trực tiếp.
     */
    private final JdbcTemplate jdbc;
    /**
     * Truy cập bảng {@code users}.
     */
    private final UserRepository users;
    /**
     * Dùng {@code refresh} để đọc lại user sau khi đã giữ khóa dòng.
     */
    private final EntityManager entities;
    /**
     * Băm mật khẩu mới (BCrypt).
     */
    private final PasswordEncoder encoder;
    /**
     * Sinh/băm mã khôi phục và tạo khóa bucket.
     */
    private final RecoverySecrets secrets;
    /**
     * Ghi nhật ký kiểm toán.
     */
    private final AuditService audit;
    /**
     * Khởi tạo dịch vụ với các phụ thuộc được Spring tiêm vào.
     */
    public PasswordRecoveryService(JdbcTemplate jdbc, UserRepository users, EntityManager entities,
            PasswordEncoder encoder, RecoverySecrets secrets, AuditService audit) {
        this.jdbc=jdbc; this.users=users; this.entities=entities; this.encoder=encoder; this.secrets=secrets; this.audit=audit;
    }
    /**
     * Xếp hàng một yêu cầu gửi mail khôi phục cho mọi địa chỉ hợp lệ, kể cả email không tồn tại hay không đủ điều kiện, để
     * phản hồi không phụ thuộc tài khoản. Chèn vào {@code password_recovery_jobs}.
     *
     * @param email  email (được chuẩn hóa lại)
     * @param locale {@code "en"} hoặc mặc định {@code "vi"}
     */
    @Transactional
    public void enqueue(String email, String locale) {
        // Queue all well-formed addresses, including unknown/ineligible users. No account-dependent response.
        jdbc.update("INSERT dbo.password_recovery_jobs(email,locale,requested_at) VALUES (?,?,SYSUTCDATETIME())",
                EmailNormalizer.normalize(email),"en".equals(locale)?"en":"vi");
    }
    /**
     * Nhận một job {@code QUEUED} kế tiếp (UPDLOCK, READPAST) và đặt thành {@code CLAIMED}. Job đã CLAIMED không tự retry sau
     * sự cố để tránh gửi trùng.
     *
     * @return id job, hoặc {@code null} nếu hàng đợi trống
     */
    @Transactional
    public Long claim() {
        var ids=jdbc.query("""
                ;WITH next_job AS (SELECT TOP (1) * FROM dbo.password_recovery_jobs WITH (UPDLOCK,READPAST,READCOMMITTEDLOCK)
                    WHERE status='QUEUED' ORDER BY job_id)
                UPDATE next_job SET status='CLAIMED' OUTPUT inserted.job_id
                """,(rs,n)->rs.getLong(1));
        return ids.isEmpty()?null:ids.getFirst();
    }
    /**
     * Chuẩn bị gửi cho một job {@code CLAIMED} (chỉ một lần): chuyển sang {@code PREPARED}; bỏ qua (SKIPPED) nếu quá 15 phút,
     * không có user, user không đủ điều kiện, email đã đổi, đã đặt lại mật khẩu sau yêu cầu, hoặc đã có từ 3 mã còn hiệu lực.
     * Khóa user, sinh mã ngẫu nhiên, lưu băm vào {@code password_reset_credentials} (hạn 15 phút, gắn authVersion và dấu vân
     * tay email) và ghi audit {@code AUTH_RECOVERY_ISSUED}.
     *
     * @param jobId id job
     * @return {@link Delivery} cần gửi, hoặc {@code null} nếu bị bỏ qua
     */
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
    /**
     * Cập nhật trạng thái cuối của job đang CLAIMED/PREPARED.
     *
     * @param jobId  id job
     * @param status một trong {@code ACCEPTED}, {@code FAILED}, {@code SKIPPED}
     * @throws IllegalArgumentException nếu trạng thái không hợp lệ
     */
    @Transactional
    public void mark(Long jobId,String status) {
        if(!java.util.Set.of("ACCEPTED","FAILED","SKIPPED").contains(status))
            throw new IllegalArgumentException("Invalid recovery job transition");
        jdbc.update("UPDATE dbo.password_recovery_jobs SET status=? WHERE job_id=? AND status IN ('CLAIMED','PREPARED')",status,jobId);
    }
    /**
     * Dọn dữ liệu cũ: bản ghi giới hạn và job quá 1 ngày, mã khôi phục hết hạn quá 7 ngày. Gọi từ {@link RecoveryMaintenance}.
     */
    @Transactional
    public void cleanup() {
        LocalDateTime now=now();
        jdbc.update("DELETE dbo.password_recovery_limits WHERE occurred_at<?",now.minusDays(1));
        jdbc.update("DELETE dbo.password_recovery_jobs WHERE requested_at<?",now.minusDays(1));
        jdbc.update("DELETE dbo.password_reset_credentials WHERE expires_at<?",now.minusDays(7));
    }
    /**
     * Đặt lại mật khẩu bằng mã khôi phục ({@code POST /api/v1/auth/password-recovery/reset}). Kiểm tra chính sách mật khẩu và
     * định dạng mã; tra băm mã; khóa user rồi kiểm tra mã còn dùng được (đúng authVersion, dấu vân tay email, chưa dùng/thu hồi,
     * chưa hết hạn); băm mật khẩu trước khi lấy mốc hạn cuối; đánh dấu mã đã dùng (nguyên tử), đổi hash, tăng auth-version
     * (vô hiệu mọi token cũ), thu hồi các mã còn lại, ghi audit {@code AUTH_PASSWORD_RESET}.
     *
     * @param credential mã khôi phục
     * @param password   mật khẩu mới
     * @throws BusinessException {@code PASSWORD_POLICY}, {@code RECOVERY_INVALID}
     */
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
    /**
     * Tài khoản đủ điều kiện khôi phục: {@code ACTIVE}, chưa bị xóa và đã bật đăng nhập bằng mật khẩu.
     */
    private boolean eligible(User u) { return "ACTIVE".equals(u.getStatus()) && u.getDeletedAt()==null && u.isPasswordLoginEnabled(); }
    /**
     * Dấu vân tay HMAC của email hiện tại, gắn vào mã để mã mất hiệu lực khi đổi email.
     */
    private String emailFingerprint(User user) { return secrets.bucket("reset-email",EmailNormalizer.normalize(user.getEmail())); }
    /**
     * Tạo ngoại lệ {@code RECOVERY_INVALID} dùng chung cho mọi lý do mã không dùng được.
     */
    private BusinessException invalid() { return new BusinessException(ErrorCode.RECOVERY_INVALID); }
    /**
     * Lấy giờ UTC từ SQL Server ({@code SYSUTCDATETIME()}) để mọi so sánh hạn dùng cùng một đồng hồ.
     */
    private LocalDateTime now() { return jdbc.queryForObject("SELECT SYSUTCDATETIME()",(rs,n)->rs.getObject(1,LocalDateTime.class)); }
    /**
     * Ghi audit: {@code AUTH_RECOVERY_ISSUED} do hệ thống (SYSTEM), {@code AUTH_PASSWORD_RESET} do người dùng.
     *
     * @param user   tài khoản liên quan
     * @param action hành động audit
     */
    private void record(User user,AuditAction action) {
        boolean issued=action==AuditAction.AUTH_RECOVERY_ISSUED;
        audit.record(new AuditEvent(action,issued?AuditActorType.SYSTEM:AuditActorType.USER,issued?null:user.getUserId(),null,"USER",user.getUserId(),
                null,null,null,Map.of("result","SUCCESS"),"AUTH_RECOVERY",null));
    }
    /**
     * Dòng job đọc từ hàng đợi (email, locale, thời điểm yêu cầu); toString được che.
     */
    private record Job(String email,String locale,LocalDateTime requestedAt) {
        @Override public String toString() { return "RecoveryJob[redacted]"; }
    }
    /**
     * Dữ liệu cần gửi mail, trả về từ {@link #prepare}; toString được che vì chứa mã.
     *
     * @param jobId      id job
     * @param email      địa chỉ nhận
     * @param locale     ngôn ngữ email
     * @param credential mã khôi phục dạng thô (chỉ tồn tại trong bộ nhớ)
     */
    public record Delivery(Long jobId,String email,String locale,String credential) {
        @Override public String toString() { return "RecoveryDelivery[redacted]"; }
    }
}
