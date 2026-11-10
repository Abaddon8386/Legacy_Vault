package com.legacyvault.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

/**
 * Limits password logins: at most 5 unconfirmed attempts within 15 minutes per email. Only the email is limited, so one
 * account being guessed never blocks other accounts that happen to share the same client IP (shared network, localhost).
 * The client IP is still stored with each failure for investigation, but it is not counted.
 *
 * <p>Checking and counting happen in one step, {@link #reserveAttempt}, under an exclusive application lock per email,
 * so concurrent requests cannot all see "below the limit". Every attempt is reserved before the password is
 * verified; a successful login releases its reservation, so only failures stay counted. It runs in REQUIRES_NEW so the
 * rollback of the login transaction cannot erase a failure.
 */
@Service
public class LoginAttemptLimiter {
    static final int LIMIT = 5;
    private static final int WINDOW_MINUTES = 15;

    private final JdbcTemplate jdbc;

    public LoginAttemptLimiter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Atomically checks the limits and reserves one attempt.
     *
     * @return the reservation id to pass to {@link #releaseAttempt} when the login succeeds
     * @throws BusinessException {@code TOO_MANY_ATTEMPTS} (429) when the email is already at the limit
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public long reserveAttempt(String normalizedEmail, String clientIp) {
        String emailHash = hash(normalizedEmail);
        lock("login-email:" + emailHash);
        jdbc.update("DELETE dbo.login_failures WHERE failed_at < DATEADD(minute, -?, SYSUTCDATETIME())",
                WINDOW_MINUTES);

        Long byEmail = jdbc.queryForObject("""
                SELECT COUNT_BIG(*) FROM dbo.login_failures
                WHERE email_hash = ? AND failed_at >= DATEADD(minute, -?, SYSUTCDATETIME())
                """, Long.class, emailHash, WINDOW_MINUTES);
        if (byEmail != null && byEmail >= LIMIT) {
            throw new BusinessException(ErrorCode.TOO_MANY_ATTEMPTS);
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

    /** Removes the reservation of a successful login so it does not count as a failure. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void releaseAttempt(long attemptId) {
        jdbc.update("DELETE dbo.login_failures WHERE failure_id = ?", attemptId);
    }

    /** Hibernate may defer the first physical BEGIN until DML; sp_getapplock needs the transaction now. */
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

    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
