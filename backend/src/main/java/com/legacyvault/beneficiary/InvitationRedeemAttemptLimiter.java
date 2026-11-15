package com.legacyvault.beneficiary;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

/** Kiểm tra cửa sổ trượt dựa trên SQL Server. Caller giữ khóa dòng User đích, tuần tự hóa
 * các lần thử của tài khoản đó giữa các instance ứng dụng. */
@Service
public class InvitationRedeemAttemptLimiter {
    private static final int LIMIT = 5;
    private final JdbcTemplate jdbc;

    public InvitationRedeemAttemptLimiter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Chặn khi tài khoản có từ 5 lần thất bại trở lên trong 15 phút gần nhất (tính chung hoặc theo từng mã).
     * @param invitationCodeHash null nếu mã sai định dạng (chỉ kiểm tra theo tài khoản)
     * @throws BusinessException TOO_MANY_ATTEMPTS khi vượt giới hạn
     */
    public void requireAllowed(Long accountId, String invitationCodeHash) {
        // Cửa sổ trượt 15 phút theo giờ UTC của SQL Server (SYSUTCDATETIME), nhất quán giữa các instance ứng dụng.
        Long accountFailures = jdbc.queryForObject("""
                SELECT COUNT_BIG(*) FROM dbo.invitation_redeem_failures
                WHERE account_id = ? AND failed_at >= DATEADD(minute, -15, SYSUTCDATETIME())
                """, Long.class, accountId);
        if (accountFailures != null && accountFailures >= LIMIT) {
            throw new BusinessException(ErrorCode.TOO_MANY_ATTEMPTS);
        }
        if (invitationCodeHash == null) return;
        Long invitationFailures = jdbc.queryForObject("""
                SELECT COUNT_BIG(*) FROM dbo.invitation_redeem_failures
                WHERE account_id = ? AND code_hash = ?
                  AND failed_at >= DATEADD(minute, -15, SYSUTCDATETIME())
                """, Long.class, accountId, invitationCodeHash);
        if (invitationFailures != null && invitationFailures >= LIMIT) {
            throw new BusinessException(ErrorCode.TOO_MANY_ATTEMPTS);
        }
    }
}
