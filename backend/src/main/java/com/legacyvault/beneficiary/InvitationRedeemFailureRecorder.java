package com.legacyvault.beneficiary;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Lưu lần nhập mã thất bại ngoài transaction đổi mã, để rollback không xóa mất bộ đếm giới hạn. */
@Service
public class InvitationRedeemFailureRecorder {
    private final JdbcTemplate jdbc;

    public InvitationRedeemFailureRecorder(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Ghi một lần đổi mã thất bại. REQUIRES_NEW để commit độc lập, vì transaction redeem sẽ rollback khi ném lỗi. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Long accountId, String invitationCodeHash) {
        jdbc.update("""
                INSERT INTO dbo.invitation_redeem_failures(account_id, code_hash, failed_at)
                VALUES (?, ?, SYSUTCDATETIME())
                """, accountId, invitationCodeHash);
    }
}
