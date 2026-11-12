package com.legacyvault.beneficiary;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Lưu lần đổi mã thất bại vào bảng {@code dbo.invitation_redeem_failures} bằng giao dịch riêng, nằm ngoài giao dịch đổi mã,
 * để rollback không xóa mất bộ đếm giới hạn. Gọi từ {@code InvitationRedeemService}.
 */
@Service
public class InvitationRedeemFailureRecorder {
    private final JdbcTemplate jdbc;

    /**
     * Hàm khởi tạo, nhận {@code JdbcTemplate}.
     */
    public InvitationRedeemFailureRecorder(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Ghi một lần thất bại vào {@code dbo.invitation_redeem_failures} trong giao dịch riêng ({@code REQUIRES_NEW}) để vẫn được lưu
     * khi giao dịch đổi mã bị rollback. Gọi từ {@code InvitationRedeemService.redeem}.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Long accountId, String invitationCodeHash) {
        jdbc.update("""
                INSERT INTO dbo.invitation_redeem_failures(account_id, code_hash, failed_at)
                VALUES (?, ?, SYSUTCDATETIME())
                """, accountId, invitationCodeHash);
    }
}
