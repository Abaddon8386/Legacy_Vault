package com.legacyvault.auth.recovery;

import java.time.LocalDateTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Bộ giới hạn tốc độ bền vững theo cửa sổ trượt cho khôi phục mật khẩu, lưu ở {@code dbo.password_recovery_limits}
 * (khóa bucket là HMAC nên không lộ email/IP). Khi bộ giới hạn lỗi thì từ chối (fail closed), không bao giờ cho chạy không đếm.
 * Được {@link PasswordRecoveryController} dùng.
 */
@Service
public class RecoveryRateLimiter {
    /**
     * Truy cập SQL trực tiếp.
     */
    private final JdbcTemplate jdbc;
    /**
     * Tạo khóa bucket dạng HMAC.
     */
    private final RecoverySecrets secrets;
    /**
     * @param jdbc    JdbcTemplate
     * @param secrets bộ bí mật tạo khóa bucket
     */
    public RecoveryRateLimiter(JdbcTemplate jdbc, RecoverySecrets secrets) { this.jdbc=jdbc; this.secrets=secrets; }

    /**
     * Kiểm tra và ghi nhận một sự kiện trong cửa sổ trượt. Lấy khóa ứng dụng độc quyền theo bucket ({@code sp_getapplock}),
     * xóa sự kiện cũ hơn cửa sổ, đếm; nếu đạt ngưỡng thì từ chối, ngược lại chèn sự kiện mới. Chạy {@code REQUIRES_NEW}.
     *
     * @param scope    phạm vi giới hạn (ví dụ {@code request-ip})
     * @param identity đối tượng bị giới hạn (IP, email hoặc mã)
     * @param maximum  số sự kiện tối đa trong cửa sổ
     * @param seconds  độ dài cửa sổ (giây)
     * @return {@code true} nếu được phép, {@code false} nếu vượt hạn mức
     * @throws IllegalStateException nếu không lấy được khóa
     */
    @Transactional(propagation=Propagation.REQUIRES_NEW,isolation=Isolation.READ_COMMITTED)
    public boolean allow(String scope, String identity, int maximum, int seconds) {
        String key=secrets.bucket(scope,identity);
        // Hibernate may defer the first physical BEGIN until DML. sp_getapplock requires it now.
        Integer result=jdbc.queryForObject("IF @@TRANCOUNT=0 BEGIN TRANSACTION; DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=?, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=5000; SELECT @r",Integer.class,"recovery:"+key);
        if(result==null || result<0) throw new IllegalStateException("Recovery limit unavailable (lock result "+result+")");
        LocalDateTime now=jdbc.queryForObject("SELECT SYSUTCDATETIME()",(rs,n)->rs.getObject(1,LocalDateTime.class));
        jdbc.update("DELETE dbo.password_recovery_limits WHERE bucket_hash=? AND occurred_at<=?",key,now.minusSeconds(seconds));
        Long count=jdbc.queryForObject("SELECT COUNT_BIG(*) FROM dbo.password_recovery_limits WHERE bucket_hash=?",Long.class,key);
        if(count!=null && count>=maximum) return false;
        jdbc.update("INSERT dbo.password_recovery_limits(bucket_hash,occurred_at) VALUES (?,?)",key,now);
        return true;
    }
}
