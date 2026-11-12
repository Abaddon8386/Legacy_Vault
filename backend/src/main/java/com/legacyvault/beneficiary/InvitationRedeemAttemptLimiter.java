package com.legacyvault.beneficiary;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

/**
 * Kiểm tra cửa sổ trượt dựa trên SQL Server. Nơi gọi đang giữ khóa dòng User của tài khoản, nhờ đó các lần thử của tài khoản
 * được tuần tự hóa giữa các instance ứng dụng.
 *
 * <p>Đếm các lần đổi mã thất bại trong bảng {@code dbo.invitation_redeem_failures} theo cửa sổ trượt 15 phút, giới hạn 5 lần trên mỗi tài khoản
 * và 5 lần trên mỗi cặp tài khoản và mã. Gọi từ {@code InvitationRedeemService.redeem}.
 */
@Service
public class InvitationRedeemAttemptLimiter {
    /**
     * Số lần thất bại tối đa trong 15 phút.
     */
    private static final int LIMIT = 5;
    private final JdbcTemplate jdbc;

    /**
     * Hàm khởi tạo, nhận {@code JdbcTemplate}.
     */
    public InvitationRedeemAttemptLimiter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Kiểm tra tài khoản (và cặp tài khoản, mã nếu có hash) chưa vượt giới hạn.
     * @param invitationCodeHash hash mã mời, có thể null nếu mã sai định dạng
     * @throws com.legacyvault.common.error.BusinessException {@code TOO_MANY_ATTEMPTS}
     */
    public void requireAllowed(Long accountId, String invitationCodeHash) {
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
