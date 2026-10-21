package com.legacyvault.beneficiary;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Persists a failed code attempt outside the redeem transaction so rollback cannot erase the limit. */
@Service
public class InvitationRedeemFailureRecorder {
    private final JdbcTemplate jdbc;

    public InvitationRedeemFailureRecorder(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Long accountId, String invitationCodeHash) {
        jdbc.update("""
                INSERT INTO dbo.invitation_redeem_failures(account_id, code_hash, failed_at)
                VALUES (?, ?, SYSUTCDATETIME())
                """, accountId, invitationCodeHash);
    }
}
