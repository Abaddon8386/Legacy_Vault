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
 * Giới hạn đăng nhập bằng mật khẩu: sau 5 lần sai chưa được xác nhận trong 15 phút, email bị khóa 15 phút, tính
 * từ lần sai thứ 5. Chỉ giới hạn theo email, nên một tài khoản bị đoán mật khẩu không chặn các tài khoản khác
 * tình cờ dùng chung IP client (mạng chia sẻ, localhost).
 * Một ngưỡng riêng theo IP, lỏng hơn nhiều (mặc định 30 lần sai/15 phút, LOGIN_IP_LIMIT), chỉ để chặn
 * một địa chỉ dò nhiều email.
 *
 * <p>Việc kiểm tra và đếm diễn ra trong một bước, {@link #reserveAttempt}, dưới khóa ứng dụng độc quyền theo email,
 * nên các request song song không thể cùng thấy "dưới giới hạn". Mỗi lượt thử được ghi vào dbo.login_failures
 * TRƯỚC khi kiểm tra mật khẩu; đăng nhập thành công sẽ xóa các lần sai của email (clearFailures), nên chỉ các lượt
 * chưa xác nhận còn được tính. Việc ghi chạy trong REQUIRES_NEW để rollback của transaction đăng nhập
 * không xóa được dấu vết lần sai.
 */
@Service
public class LoginAttemptLimiter {
    static final int LIMIT = 5;
    static final int DEFAULT_IP_LIMIT = 30;
    private static final int WINDOW_MINUTES = 15;

    private final JdbcTemplate jdbc;
    /** Email đã chuẩn hóa không bao giờ bị khóa. Rỗng (mặc định) nghĩa là không ai được miễn. */
    private final Set<String> exemptEmails;
    private final int ipLimit;

    public LoginAttemptLimiter(JdbcTemplate jdbc) {
        this(jdbc, "");
    }

    public LoginAttemptLimiter(JdbcTemplate jdbc, String exemptEmails) {
        this(jdbc, exemptEmails, DEFAULT_IP_LIMIT);
    }

    /**
     * @param ipLimit số lần sai tối đa một IP client có thể gây ra trong 15 phút trên mọi email (mặc định 30)
     * @param exemptEmails danh sách email phân tách bằng dấu phẩy được bỏ qua khóa, chỉ dành cho tài khoản demo dùng chung. Để trống ở
     *                     mọi môi trường thật. Đặt bằng LOGIN_LOCKOUT_EXEMPT_EMAILS hoặc legacyvault.auth.login-lockout.exempt-emails.
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
     * Kiểm tra giới hạn và đặt chỗ một lượt thử một cách nguyên tử.
     *
     * @return id của lượt thử đã ghi, hoặc 0 khi email được miễn và không ghi gì
     * @throws BusinessException {@code TOO_MANY_ATTEMPTS} (429) khi email đã chạm giới hạn
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public long reserveAttempt(String normalizedEmail, String clientIp) {
        if (exemptEmails.contains(normalizedEmail)) {
            return 0L;
        }
        String emailHash = hash(normalizedEmail);
        // Thứ tự cố định (email rồi IP) để hai request không deadlock trên khóa của nhau.
        // Khóa theo email rồi theo IP với thứ tự cố định để tránh deadlock; sp_getapplock tuần tự hóa các request song song cùng email.
        lock("login-email:" + emailHash);
        if (clientIp != null) {
            lock("login-ip:" + clientIp);
        }
        // Giữ các dòng trong hai cửa sổ để tính khóa từ lần sai gần nhất; dòng cũ hơn là rác.
        jdbc.update("DELETE dbo.login_failures WHERE failed_at < DATEADD(minute, -?, SYSUTCDATETIME())",
                2 * WINDOW_MINUTES);

        // Bị khóa = lần sai gần nhất còn trong cửa sổ VÀ 15 phút kết thúc tại lần sai gần nhất có
        // ít nhất LIMIT lần sai. Lượt bị chặn không được ghi, nên lần sai gần nhất vẫn là lần thứ 5 và
        // khóa kết thúc đúng WINDOW_MINUTES sau đó (khóa cố định, không trượt).
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
            // Giới hạn IP chỉ chặn một địa chỉ dò nhiều email; ngưỡng rộng hơn nhiều để không ảnh hưởng mạng dùng chung.
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

    /** Đăng nhập thành công xóa mọi lần sai còn được tính của email đó, để lỗi gõ trước đó không tồn đọng. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void clearFailures(String normalizedEmail) {
        if (exemptEmails.contains(normalizedEmail)) {
            return;
        }
        jdbc.update("DELETE dbo.login_failures WHERE email_hash = ?", hash(normalizedEmail));
    }

    /** Hibernate có thể hoãn BEGIN vật lý đầu tiên đến khi có DML; sp_getapplock cần transaction ngay lúc này. */
    private void lock(String resource) {
        Integer result = jdbc.queryForObject("""
                IF @@TRANCOUNT=0 BEGIN TRANSACTION;
                DECLARE @r int;
                EXEC @r=sys.sp_getapplock @Resource=?, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=5000;
                SELECT @r""", Integer.class, resource);
        // Fail closed: nếu không lấy được khóa thì lượt thử không được đi tiếp mà không bị đếm.
        if (result == null || result < 0) {
            throw new IllegalStateException("Login limit unavailable (lock result " + result + ")");
        }
    }

    // Email chỉ được lưu dưới dạng SHA-256 trong login_failures (không lưu email thô).
    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
