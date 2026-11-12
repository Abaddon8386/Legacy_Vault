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
 * Nghiệp vụ xác minh quyền sở hữu email. Dùng SQL trực tiếp trên {@code dbo.email_verification_jobs} (hàng đợi gửi mail) và
 * {@code dbo.email_verification_credentials} (mã một lần, lưu băm, có thế hệ), cùng bảng {@code users} (cột
 * {@code email_verified_at}); ghi audit {@code AUTH_EMAIL_VERIFICATION_ISSUED} / {@code AUTH_EMAIL_VERIFIED}. Tài khoản
 * luôn lấy từ principal (yêu cầu) hoặc từ chính mã (xác nhận); client không bao giờ chỉ định tài khoản hay cờ đã xác minh.
 * Thứ tự khóa: User -> (Job) -> Credential; Job chỉ bị khóa ở claim/prepare, trước User. Được
 * {@link EmailVerificationController}, {@link EmailVerificationDeliveryWorker}, {@link EmailVerificationMaintenance}
 * và {@code AuthService} (khi đổi email) gọi.
 */
@Service
public class EmailVerificationService {
    /**
     * Kết quả của {@link #enqueue}: đã xếp hàng, email đã xác minh sẵn, hoặc tài khoản không áp dụng (ví dụ chỉ dùng Google).
     */
    public enum Outcome { QUEUED, ALREADY_VERIFIED, NOT_APPLICABLE }

    /**
     * Truy cập SQL trực tiếp.
     */
    private final JdbcTemplate jdbc;
    /**
     * Truy cập bảng {@code users}.
     */
    private final UserRepository users;
    /**
     * Dùng {@code refresh} để đọc lại user sau khi giữ khóa dòng.
     */
    private final EntityManager entities;
    /**
     * Sinh/băm mã và dấu vân tay email.
     */
    private final EmailVerificationSecrets secrets;
    /**
     * Cấu hình TTL, giới hạn và cờ gửi.
     */
    private final EmailVerificationConfiguration config;
    /**
     * Ghi nhật ký kiểm toán.
     */
    private final AuditService audit;
    /**
     * Khởi tạo dịch vụ với các phụ thuộc được Spring tiêm vào.
     */
    public EmailVerificationService(JdbcTemplate jdbc, UserRepository users, EntityManager entities,
            EmailVerificationSecrets secrets, EmailVerificationConfiguration config, AuditService audit) {
        this.jdbc=jdbc; this.users=users; this.entities=entities; this.secrets=secrets; this.config=config; this.audit=audit;
    }

    /**
     * Trạng thái xác minh email của một người dùng ({@code GET /api/v1/auth/email-verification}): đã xác minh chưa, có được yêu cầu
     * gửi mail không (chưa xác minh, đủ điều kiện, tính năng bật) và job gần nhất.
     *
     * @param userId id nội bộ
     * @return {@link Status}
     * @throws BusinessException {@code UNAUTHENTICATED}
     */
    @Transactional(readOnly=true)
    public Status status(Long userId) {
        User user=users.findById(userId).orElseThrow(()->new BusinessException(ErrorCode.UNAUTHENTICATED));
        var last=jdbc.query("SELECT TOP (1) status,requested_at FROM dbo.email_verification_jobs WHERE user_id=? ORDER BY job_id DESC",
                (rs,n)->new Last(deliveryState(rs.getString(1)),rs.getObject(2,LocalDateTime.class)),userId);
        boolean available=user.getEmailVerifiedAt()==null && eligible(user) && config.ready();
        return new Status(user.getEmailVerifiedAt()!=null,user.getEmailVerifiedAt(),available,
                last.isEmpty()?null:last.getFirst().state(),last.isEmpty()?null:last.getFirst().at());
    }

    /**
     * Xếp hàng một job gửi mail xác minh cho email hiện tại của người gọi; yêu cầu đầu và gửi lại là một thao tác. Khóa user,
     * làm mới thực thể rồi chèn vào {@code email_verification_jobs} kèm dấu vân tay email.
     *
     * @param userId id nội bộ
     * @param locale {@code "en"} hoặc mặc định {@code "vi"}
     * @return {@link Outcome}
     * @throws BusinessException {@code UNAUTHENTICATED}
     */
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

    /**
     * Nhận một job {@code QUEUED} kế tiếp (UPDLOCK, READPAST) và đặt thành {@code CLAIMED}.
     *
     * @return id job, hoặc {@code null} nếu hàng đợi trống
     */
    @Transactional
    public Long claim() {
        var ids=jdbc.query("""
                ;WITH next_job AS (SELECT TOP (1) * FROM dbo.email_verification_jobs WITH (UPDLOCK,READPAST,READCOMMITTEDLOCK)
                    WHERE status='QUEUED' ORDER BY job_id)
                UPDATE next_job SET status='CLAIMED' OUTPUT inserted.job_id
                """,(rs,n)->rs.getLong(1));
        return ids.isEmpty()?null:ids.getFirst();
    }

    /**
     * Tạo mã cho một job đã CLAIMED đúng một lần; mã thô chỉ tồn tại trong {@link Delivery} trả về. Thứ tự khóa User -> Job
     * -> Credential, giống thao tác đổi email: đọc job không khóa, khóa user, rồi mới chuyển job bằng UPDATE có điều kiện
     * trạng thái (job đã bị đổi email bỏ qua hoặc worker khác chuẩn bị thì không cập nhật dòng nào). Bỏ qua nếu tính năng
     * tắt, job quá TTL, user không còn hợp lệ, email đã xác minh hoặc dấu vân tay email đã đổi. Gửi lại thay thế: thu hồi mã chưa dùng
     * cũ, tăng thế hệ, lưu mã mới và ghi audit {@code AUTH_EMAIL_VERIFICATION_ISSUED}.
     *
     * @param jobId id job
     * @return {@link Delivery} cần gửi, hoặc {@code null} nếu bỏ qua
     */
    @Transactional
    public Delivery prepare(Long jobId) {
        var jobs=jdbc.query("SELECT user_id,email_fingerprint,locale,requested_at FROM dbo.email_verification_jobs WHERE job_id=? AND status='CLAIMED'",
                (rs,n)->new Job(rs.getLong(1),rs.getString(2),rs.getString(3),rs.getObject(4,LocalDateTime.class)),jobId);
        if(jobs.isEmpty()) return null;
        Job job=jobs.getFirst();
        // These two exits hold only the job row and take no further lock afterwards.
        if(!config.ready()) { mark(jobId,"SKIPPED"); return null; }
        // A job older than one credential lifetime is stale: the worker may have been off for a long time.
        if(job.requestedAt().isBefore(now().minusMinutes(config.ttlMinutes()))) { mark(jobId,"SKIPPED"); return null; }
        User user=users.findActiveAccountForUpdate(job.userId()).orElse(null);
        if(user==null) { mark(jobId,"SKIPPED"); return null; }
        entities.refresh(user);
        // Still CLAIMED? Anyone who changed it did so under the User lock we now hold, so this check is race-free.
        if(jdbc.update("UPDATE dbo.email_verification_jobs SET status='PREPARED' WHERE job_id=? AND status='CLAIMED'",jobId)!=1) return null;
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

    /**
     * Cập nhật trạng thái cuối của job đang CLAIMED/PREPARED.
     *
     * @param jobId  id job
     * @param status {@code ACCEPTED}, {@code FAILED} hoặc {@code SKIPPED}
     * @throws IllegalArgumentException nếu trạng thái không hợp lệ
     */
    @Transactional
    public void mark(Long jobId,String status) {
        if(!java.util.Set.of("ACCEPTED","FAILED","SKIPPED").contains(status))
            throw new IllegalArgumentException("Invalid email verification job transition");
        jdbc.update("UPDATE dbo.email_verification_jobs SET status=? WHERE job_id=? AND status IN ('CLAIMED','PREPARED')",status,jobId);
    }

    /**
     * Xác nhận mã ({@code POST /api/v1/auth/email-verification/confirm}): tiêu thụ mã và ghi {@code email_verified_at} trong một
     * transaction, lỗi bất kỳ rollback cả hai. Chỉ chấp nhận mã thế hệ mới nhất, đúng dấu vân tay email, chưa dùng/thu hồi/hết hạn;
     * sau đó thu hồi các mã còn lại và ghi audit {@code AUTH_EMAIL_VERIFIED}.
     *
     * @param credential mã xác minh
     * @throws BusinessException {@code EMAIL_VERIFICATION_INVALID}
     */
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
     * Được {@code AuthService.updateCurrentUser} gọi trong transaction đổi email: mã đang mở chết cùng địa chỉ cũ và job còn
     * trong hàng đợi bị bỏ qua. Không gửi gì mới, người dùng phải yêu cầu lại. Người gọi đã giữ khóa user; thứ tự job rồi credential
     * giống prepare và cleanup.
     *
     * @param userId id nội bộ
     */
    @Transactional
    public void revokeForEmailChange(Long userId) {
        jdbc.update("UPDATE dbo.email_verification_jobs SET status='SKIPPED' WHERE user_id=? AND status IN ('QUEUED','CLAIMED','PREPARED')",userId);
        jdbc.update("UPDATE dbo.email_verification_credentials SET revoked_at=SYSUTCDATETIME() WHERE user_id=? AND consumed_at IS NULL AND revoked_at IS NULL",userId);
    }

    /**
     * Dọn dữ liệu cũ: job quá 1 ngày, mã hết hạn quá 7 ngày. Gọi từ {@link EmailVerificationMaintenance}.
     */
    @Transactional
    public void cleanup() {
        LocalDateTime now=now();
        jdbc.update("DELETE dbo.email_verification_jobs WHERE requested_at<?",now.minusDays(1));
        jdbc.update("DELETE dbo.email_verification_credentials WHERE expires_at<?",now.minusDays(7));
    }

    /**
     * Chỉ tài khoản đăng ký bằng mật khẩu mới chứng minh hộp thư ở đây; tài khoản chỉ dùng Google không áp dụng (PS-85).
     * Điều kiện: {@code ACTIVE}, chưa xóa, bật đăng nhập mật khẩu.
     */
    private boolean eligible(User u) { return "ACTIVE".equals(u.getStatus()) && u.getDeletedAt()==null && u.isPasswordLoginEnabled(); }
    /**
     * Dấu vân tay HMAC của email hiện tại của user.
     */
    private String fingerprint(User user) { return secrets.emailFingerprint(EmailNormalizer.normalize(user.getEmail())); }
    /**
     * Tạo ngoại lệ {@code EMAIL_VERIFICATION_INVALID} dùng chung cho mọi lý do mã không dùng được.
     */
    private BusinessException invalid() { return new BusinessException(ErrorCode.EMAIL_VERIFICATION_INVALID); }
    /**
     * Giờ UTC lấy từ SQL Server ({@code SYSUTCDATETIME()}).
     */
    private LocalDateTime now() { return jdbc.queryForObject("SELECT SYSUTCDATETIME()",(rs,n)->rs.getObject(1,LocalDateTime.class)); }
    /**
     * Đổi trạng thái job nội bộ sang trạng thái công khai ({@code ACCEPTED} thành {@code PROVIDER_ACCEPTED}; trạng thái khác coi là {@code QUEUED}).
     */
    private static String deliveryState(String jobStatus) {
        return switch(jobStatus) { case "ACCEPTED"->"PROVIDER_ACCEPTED"; case "FAILED"->"FAILED"; case "SKIPPED"->"SKIPPED"; default->"QUEUED"; };
    }
    /**
     * Ghi audit: ISSUED do hệ thống (SYSTEM), VERIFIED do người dùng.
     *
     * @param user   tài khoản liên quan
     * @param action hành động audit
     */
    private void record(User user,AuditAction action) {
        boolean issued=action==AuditAction.AUTH_EMAIL_VERIFICATION_ISSUED;
        audit.record(new AuditEvent(action,issued?AuditActorType.SYSTEM:AuditActorType.USER,issued?null:user.getUserId(),null,"USER",user.getUserId(),
                null,null,null,Map.of("result","SUCCESS"),"AUTH_EMAIL_VERIFICATION",null));
    }

    /**
     * Dòng job đọc từ hàng đợi; toString được che.
     */
    private record Job(Long userId,String fingerprint,String locale,LocalDateTime requestedAt) {
        @Override public String toString() { return "EmailVerificationJob[redacted]"; }
    }
    /**
     * Trạng thái và thời điểm của job gần nhất.
     */
    private record Last(String state,LocalDateTime at) { }
    /**
     * Trạng thái xác minh email trả cho controller.
     *
     * @param verified         đã xác minh chưa
     * @param verifiedAt       thời điểm xác minh
     * @param requestAvailable có thể yêu cầu gửi mail không
     * @param lastRequestState trạng thái yêu cầu gần nhất
     * @param lastRequestedAt  thời điểm yêu cầu gần nhất
     */
    public record Status(boolean verified,LocalDateTime verifiedAt,boolean requestAvailable,String lastRequestState,LocalDateTime lastRequestedAt) { }
    /**
     * Dữ liệu cần gửi, trả về từ {@link #prepare}; toString được che vì chứa mã.
     *
     * @param jobId      id job
     * @param email      địa chỉ nhận
     * @param locale     ngôn ngữ email
     * @param credential mã xác minh dạng thô
     */
    public record Delivery(Long jobId,String email,String locale,String credential) {
        @Override public String toString() { return "EmailVerificationDelivery[redacted]"; }
    }
}
