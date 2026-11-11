package com.legacyvault.verification;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;

import com.legacyvault.auth.LoginAttemptLimiter;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

/** Regression for the check-then-record race: parallel attempts must not all slip under the limit. */
class LoginAttemptLimiterSqlServerTest extends LegalBasisSqlServerSupport {

    private static final int PARALLEL = 8;

    @Test
    void parallelAttemptsForTheSameEmailAndIpAdmitExactlyFive() throws Exception {
        LoginAttemptLimiter limiter = context.getBean(LoginAttemptLimiter.class);
        String email = UUID.randomUUID() + "@example.test";
        String ip = "198.51.100." + (int) (Math.random() * 200 + 1);

        List<Object> outcomes = runInParallel(() -> limiter.reserveAttempt(email, ip));

        long admitted = outcomes.stream().filter(o -> o instanceof Long).count();
        long blocked = outcomes.stream()
                .filter(o -> o instanceof BusinessException e && e.getErrorCode() == ErrorCode.TOO_MANY_ATTEMPTS).count();
        assertThat(admitted).as("attempts admitted").isEqualTo(5);
        assertThat(blocked).as("attempts rejected with 429").isEqualTo(PARALLEL - 5);
    }

    @Test
    void theLockLastsFifteenMinutesFromTheFifthFailureNotFromTheFirst() {
        LoginAttemptLimiter limiter = context.getBean(LoginAttemptLimiter.class);
        org.springframework.jdbc.core.JdbcTemplate jdbc = context.getBean(org.springframework.jdbc.core.JdbcTemplate.class);
        String email = UUID.randomUUID() + "@example.test";
        String hash = java.util.HexFormat.of().formatHex(sha256(email));
        // Failures 16, 14, 13, 12 and 11 minutes ago. A sliding window would already have dropped the first one (older
        // than 15 minutes) and let the email in, but the 5th failure was only 11 minutes ago, so it must still be locked.
        for (int minutesAgo : new int[] { 16, 14, 13, 12, 11 }) {
            jdbc.update("INSERT dbo.login_failures(email_hash, client_ip, failed_at) "
                    + "VALUES (?, NULL, DATEADD(minute, -?, SYSUTCDATETIME()))", hash, minutesAgo);
        }

        BusinessException blocked = org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class,
                () -> limiter.reserveAttempt(email, null));
        assertThat(blocked.getErrorCode()).isEqualTo(ErrorCode.TOO_MANY_ATTEMPTS);
    }

    @Test
    void theEmailCanTryAgainOnceFifteenMinutesPassedSinceTheFifthFailure() {
        LoginAttemptLimiter limiter = context.getBean(LoginAttemptLimiter.class);
        org.springframework.jdbc.core.JdbcTemplate jdbc = context.getBean(org.springframework.jdbc.core.JdbcTemplate.class);
        String email = UUID.randomUUID() + "@example.test";
        String hash = java.util.HexFormat.of().formatHex(sha256(email));
        for (int minutesAgo : new int[] { 20, 19, 18, 17, 16 }) {
            jdbc.update("INSERT dbo.login_failures(email_hash, client_ip, failed_at) "
                    + "VALUES (?, NULL, DATEADD(minute, -?, SYSUTCDATETIME()))", hash, minutesAgo);
        }

        // The 5th failure was 16 minutes ago, so the lock is over and a new attempt is admitted.
        assertThat(limiter.reserveAttempt(email, null)).isPositive();
    }

    private static byte[] sha256(String value) {
        try {
            return java.security.MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void aSuccessfulLoginClearsEarlierFailuresOfThatEmail() {
        LoginAttemptLimiter limiter = context.getBean(LoginAttemptLimiter.class);
        String email = UUID.randomUUID() + "@example.test";

        for (int i = 0; i < 4; i++) {
            limiter.reserveAttempt(email, null);
        }
        limiter.clearFailures(email);

        // Without the clear, a fifth and sixth reservation would reach the limit of 5.
        for (int i = 0; i < 5; i++) {
            limiter.reserveAttempt(email, null);
        }
    }

    private static List<Object> runInParallel(Callable<Object> task) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(PARALLEL);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Object>> futures = new ArrayList<>();
            for (int i = 0; i < PARALLEL; i++) {
                futures.add(pool.submit(() -> {
                    start.await();
                    try {
                        return task.call();
                    } catch (BusinessException e) {
                        return e;
                    }
                }));
            }
            start.countDown();
            List<Object> results = new ArrayList<>();
            for (Future<Object> f : futures) results.add(f.get());
            return results;
        } finally {
            pool.shutdownNow();
        }
    }
}
