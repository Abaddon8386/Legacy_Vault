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
 * Limits password logins: after 5 unconfirmed failures within 15 minutes an email is locked for 15 minutes, counted
 * from its 5th failure. Only the email is limited, so one
 * account being guessed never blocks other accounts that happen to share the same client IP (shared network, localhost).
 * A separate, much looser per-IP cap (default 30 failures per 15 minutes, LOGIN_IP_LIMIT) only stops one address from
 * guessing across many emails.
 *
 * <p>Checking and counting happen in one step, {@link #reserveAttempt}, under an exclusive application lock per email,
 * so concurrent requests cannot all see "below the limit". Every attempt is reserved before the password is
 * verified; a successful login clears the email's failures (clearFailures), so only unconfirmed attempts stay counted. It runs in REQUIRES_NEW so the
 * rollback of the login transaction cannot erase a failure.
 */
@Service
public class LoginAttemptLimiter {
    static final int LIMIT = 5;
    static final int DEFAULT_IP_LIMIT = 30;
    private static final int WINDOW_MINUTES = 15;

    private final JdbcTemplate jdbc;
    /** Normalized emails that are never locked. Empty (the default) means nobody is exempt. */
    private final Set<String> exemptEmails;
    private final int ipLimit;

    public LoginAttemptLimiter(JdbcTemplate jdbc) {
        this(jdbc, "");
    }

    public LoginAttemptLimiter(JdbcTemplate jdbc, String exemptEmails) {
        this(jdbc, exemptEmails, DEFAULT_IP_LIMIT);
    }

    /**
     * @param ipLimit failures one client IP may cause within 15 minutes across all emails (default 30)
     * @param exemptEmails comma-separated emails that skip the lockout, for shared demo accounts only. Leave empty in any
     *                     real environment. Set with LOGIN_LOCKOUT_EXEMPT_EMAILS or legacyvault.auth.login-lockout.exempt-emails.
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
     * Atomically checks the limits and reserves one attempt.
     *
     * @return the id of the recorded attempt, or 0 when the email is exempt and nothing was recorded
     * @throws BusinessException {@code TOO_MANY_ATTEMPTS} (429) when the email is already at the limit
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public long reserveAttempt(String normalizedEmail, String clientIp) {
        if (exemptEmails.contains(normalizedEmail)) {
            return 0L;
        }
        String emailHash = hash(normalizedEmail);
        // Fixed order (email, then IP) so two requests cannot deadlock on each other's locks.
        lock("login-email:" + emailHash);
        if (clientIp != null) {
            lock("login-ip:" + clientIp);
        }
        // Rows are kept for two windows so the lock can be measured from the latest failure; older ones are junk.
        jdbc.update("DELETE dbo.login_failures WHERE failed_at < DATEADD(minute, -?, SYSUTCDATETIME())",
                2 * WINDOW_MINUTES);

        // Locked = the latest failure is still inside the window AND the 15 minutes ending at that latest failure hold
        // at least LIMIT failures. Blocked attempts are not recorded, so the latest failure stays the 5th one and the
        // lock ends exactly WINDOW_MINUTES after it (a fixed lock, not a sliding one).
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

    /** A successful login clears every failure still counted for that email, so earlier typos do not linger. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void clearFailures(String normalizedEmail) {
        if (exemptEmails.contains(normalizedEmail)) {
            return;
        }
        jdbc.update("DELETE dbo.login_failures WHERE email_hash = ?", hash(normalizedEmail));
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
