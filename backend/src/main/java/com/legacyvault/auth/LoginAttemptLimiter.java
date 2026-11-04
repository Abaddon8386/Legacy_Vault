package com.legacyvault.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

/**
 * Limits failed password logins: 5 failures within 15 minutes per email, and the same per client IP.
 * Failures are written in REQUIRES_NEW so the rollback of the login transaction cannot erase them.
 */
@Service
public class LoginAttemptLimiter {
    static final int LIMIT = 5;
    private static final int WINDOW_MINUTES = 15;

    private final JdbcTemplate jdbc;

    public LoginAttemptLimiter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** @throws BusinessException {@code RATE_LIMITED} (429) when the email or the IP is over the limit. */
    public void requireAllowed(String normalizedEmail, String clientIp) {
        Long byEmail = jdbc.queryForObject("""
                SELECT COUNT_BIG(*) FROM dbo.login_failures
                WHERE email_hash = ? AND failed_at >= DATEADD(minute, -?, SYSUTCDATETIME())
                """, Long.class, hash(normalizedEmail), WINDOW_MINUTES);
        if (byEmail != null && byEmail >= LIMIT) {
            throw new BusinessException(ErrorCode.RATE_LIMITED);
        }
        if (clientIp == null) return;
        Long byIp = jdbc.queryForObject("""
                SELECT COUNT_BIG(*) FROM dbo.login_failures
                WHERE client_ip = ? AND failed_at >= DATEADD(minute, -?, SYSUTCDATETIME())
                """, Long.class, clientIp, WINDOW_MINUTES);
        if (byIp != null && byIp >= LIMIT) {
            throw new BusinessException(ErrorCode.RATE_LIMITED);
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(String normalizedEmail, String clientIp) {
        jdbc.update("DELETE dbo.login_failures WHERE failed_at < DATEADD(minute, -?, SYSUTCDATETIME())",
                WINDOW_MINUTES);
        jdbc.update("""
                INSERT INTO dbo.login_failures(email_hash, client_ip, failed_at)
                VALUES (?, ?, SYSUTCDATETIME())
                """, hash(normalizedEmail), clientIp);
    }

    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
