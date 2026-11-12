package com.legacyvault.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

/**
 * Giới hạn đăng nhập bằng mật khẩu: sau 5 lần thất bại chưa được xác nhận trong 15 phút, email bị khóa 15 phút tính
 * từ lần thất bại thứ 5. Chỉ khóa theo email nên một tài khoản bị dò mật khẩu không chặn tài khoản khác dùng chung IP.
 * Ngoài ra có hạn mức theo IP lỏng hơn nhiều (mặc định 30 lần/15 phút, {@code LOGIN_IP_LIMIT}) chỉ để chặn một địa chỉ dò
 * nhiều email.
 *
 * <p>Kiểm tra và đếm diễn ra trong một bước, {@link #reserveAttempt}, dưới khóa ứng dụng độc quyền
 * ({@code sp_getapplock}) theo email nên các request song song không cùng thấy "dưới ngưỡng". Mỗi lần thử được giữ chỗ
 * trước khi kiểm tra mật khẩu; đăng nhập thành công xóa các lần thất bại của email ({@link #clearFailures}). Chạy trong
 * {@code REQUIRES_NEW} nên rollback của transaction đăng nhập không xóa được lần thất bại. Dữ liệu nằm ở bảng
 * {@code dbo.login_failures} (email băm SHA-256, IP, thời điểm). Được {@code AuthService.login} gọi.
 */
@Service
public class LoginAttemptLimiter {
    /**
     * Số lần thất bại tối đa theo email trong một cửa sổ trước khi bị khóa.
     */
    static final int LIMIT = 5;
    /**
     * Số lần thất bại mặc định cho phép từ một IP (trên mọi email) trong một cửa sổ.
     */
    static final int DEFAULT_IP_LIMIT = 30;
    /**
     * Độ dài cửa sổ tính và thời gian khóa (phút).
     */
    private static final int WINDOW_MINUTES = 15;

    /**
     * Truy vấn SQL trực tiếp vào {@code dbo.login_failures}.
     */
    private final JdbcTemplate jdbc;
    /** Normalized emails that are never locked. Empty (the default) means nobody is exempt. */
    private final Set<String> exemptEmails;
    /**
     * Hạn mức thất bại theo IP trong một cửa sổ.
     */
    private final int ipLimit;

    /**
     * Constructor tiện dụng: không email nào được miễn trừ, hạn mức IP mặc định.
     *
     * @param jdbc JdbcTemplate
     */
    public LoginAttemptLimiter(JdbcTemplate jdbc) {
        this(jdbc, "");
    }

    /**
     * Constructor tiện dụng cho test: có danh sách email miễn trừ, hạn mức IP mặc định.
     *
     * @param jdbc         JdbcTemplate
     * @param exemptEmails danh sách email (phân tách bằng dấu phẩy) bỏ qua khóa
     */
    public LoginAttemptLimiter(JdbcTemplate jdbc, String exemptEmails) {
        this(jdbc, exemptEmails, DEFAULT_IP_LIMIT);
    }

    /**
     * Constructor chính do Spring dùng. Chuẩn hóa danh sách email miễn trừ bằng {@link EmailNormalizer}.
     *
     * @param jdbc         JdbcTemplate
     * @param exemptEmails email (phân tách bằng dấu phẩy) bỏ qua khóa, chỉ dành cho tài khoản demo dùng chung; để trống ở
     *                     môi trường thật. Cấu hình bằng LOGIN_LOCKOUT_EXEMPT_EMAILS hoặc legacyvault.auth.login-lockout.exempt-emails
     * @param ipLimit      số lần thất bại một IP được gây ra trong 15 phút trên mọi email (mặc định 30)
     */
    @Autowired
    public LoginAttemptLimiter(JdbcTemplate jdbc,
            @Value("${legacyvault.auth.login-lockout.exempt-emails:${LOGIN_LOCKOUT_EXEMPT_EMAILS:}}") String exemptEmails,
            @Value("${legacyvault.auth.login-lockout.ip-limit:${LOGIN_IP_LIMIT:30}}") int ipLimit) {
        this.jdbc = jdbc;
        this.ipLimit = ipLimit;
        this.exemptEmails = Arrays.stream(exemptEmails == null ? new String[0] : exemptEmails.split(","))
                .map(EmailNormalizer::normalize)
                .filter(email -> email != null && !email.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    /**
     * Kiểm tra hạn mức và giữ chỗ một lần thử một cách nguyên tử. Thứ tự khóa cố định (email rồi IP) để tránh deadlock;
     * xóa các dòng cũ hơn hai cửa sổ; email bị khóa khi lần thất bại mới nhất còn trong cửa sổ và 15 phút kết thúc tại đó
     * có ít nhất {@link #LIMIT} lần (khóa cố định, không trượt; các lần bị chặn không được ghi). Sau đó kiểm tra hạn mức IP
     * và chèn một dòng vào {@code dbo.login_failures}.
     *
     * @param normalizedEmail email đã chuẩn hóa
     * @param clientIp        IP nguồn, có thể {@code null}
     * @return id của lần thử đã ghi, hoặc 0 nếu email được miễn trừ và không ghi gì
     * @throws BusinessException {@code TOO_MANY_ATTEMPTS} (429) khi email đã chạm ngưỡng; {@code RATE_LIMITED} khi IP vượt hạn mức
     * @throws IllegalStateException nếu không lấy được khóa (đóng kín: không cho thử không đếm)
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public long reserveAttempt(String normalizedEmail, String clientIp) {
        if (exemptEmails.contains(normalizedEmail)) {
            return 0L;
        }
        String emailHash = hash(normalizedEmail);
        // Fixed order (email, then IP) so two requests cannot deadlock on each other's locks.
        lock("login-email:" + emailHash);
        if (clientIp != null) {
            lock("login-ip:" + clientIp);
        }
        // Rows are kept for two windows so the lock can be measured from the latest failure; older ones are junk.
        jdbc.update("DELETE dbo.login_failures WHERE failed_at < DATEADD(minute, -?, SYSUTCDATETIME())",
                2 * WINDOW_MINUTES);

        // Locked = the latest failure is still inside the window AND the 15 minutes ending at that latest failure hold
        // at least LIMIT failures. Blocked attempts are not recorded, so the latest failure stays the 5th one and the
        // lock ends exactly WINDOW_MINUTES after it (a fixed lock, not a sliding one).
        Long byEmail = jdbc.queryForObject("""
                SELECT COUNT_BIG(*) FROM dbo.login_failures
                WHERE email_hash = ?
                  AND failed_at >= DATEADD(minute, -?, (SELECT MAX(failed_at) FROM dbo.login_failures WHERE email_hash = ?))
                  AND (SELECT MAX(failed_at) FROM dbo.login_failures WHERE email_hash = ?)
                      > DATEADD(minute, -?, SYSUTCDATETIME())
                """, Long.class, emailHash, WINDOW_MINUTES, emailHash, emailHash, WINDOW_MINUTES);
        if (byEmail != null && byEmail >= LIMIT) {
            throw new BusinessException(ErrorCode.TOO_MANY_ATTEMPTS);
        }
        if (clientIp != null) {
            Long byIp = jdbc.queryForObject("""
                    SELECT COUNT_BIG(*) FROM dbo.login_failures
                    WHERE client_ip = ? AND failed_at >= DATEADD(minute, -?, SYSUTCDATETIME())
                    """, Long.class, clientIp, WINDOW_MINUTES);
            if (byIp != null && byIp >= ipLimit) {
                throw new BusinessException(ErrorCode.RATE_LIMITED);
            }
        }
        Long id = jdbc.queryForObject("""
                INSERT dbo.login_failures(email_hash, client_ip, failed_at)
                OUTPUT inserted.failure_id
                VALUES (?, ?, SYSUTCDATETIME())
                """, Long.class, emailHash, clientIp);
        if (id == null) {
            throw new IllegalStateException("Login attempt could not be recorded");
        }
        return id;
    }

    /**
     * Xóa mọi lần thất bại còn được tính của email sau khi đăng nhập thành công, để lỗi gõ nhầm trước đó không còn tồn
     * đọng. Bỏ qua nếu email được miễn trừ.
     *
     * @param normalizedEmail email đã chuẩn hóa
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void clearFailures(String normalizedEmail) {
        if (exemptEmails.contains(normalizedEmail)) {
            return;
        }
        jdbc.update("DELETE dbo.login_failures WHERE email_hash = ?", hash(normalizedEmail));
    }

    /**
     * Lấy khóa ứng dụng độc quyền kiểu giao dịch ({@code sp_getapplock}, chờ tối đa 5 giây). Hibernate có thể trì hoãn
     * BEGIN thật sự tới khi có DML nên mở transaction ngay tại đây.
     *
     * @param resource tên tài nguyên khóa
     * @throws IllegalStateException nếu không lấy được khóa
     */
    private void lock(String resource) {
        Integer result = jdbc.queryForObject("""
                IF @@TRANCOUNT=0 BEGIN TRANSACTION;
                DECLARE @r int;
                EXEC @r=sys.sp_getapplock @Resource=?, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=5000;
                SELECT @r""", Integer.class, resource);
        // Fail closed: if the lock cannot be taken, the attempt is not allowed to proceed unmetered.
        if (result == null || result < 0) {
            throw new IllegalStateException("Login limit unavailable (lock result " + result + ")");
        }
    }

    /**
     * Băm SHA-256 (hex) để không lưu email thô trong bảng thất bại.
     *
     * @param value chuỗi cần băm
     * @return 64 ký tự hex
     */
    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
