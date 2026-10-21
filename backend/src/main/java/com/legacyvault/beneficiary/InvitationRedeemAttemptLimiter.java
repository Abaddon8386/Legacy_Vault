package com.legacyvault.beneficiary;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

/** SQL Server backed sliding-window checks. The caller holds the target User row lock, serializing
 * attempts for that account across application instances. */
@Service
public class InvitationRedeemAttemptLimiter {
    private static final int LIMIT = 5;
    private final JdbcTemplate jdbc;

    public InvitationRedeemAttemptLimiter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

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
