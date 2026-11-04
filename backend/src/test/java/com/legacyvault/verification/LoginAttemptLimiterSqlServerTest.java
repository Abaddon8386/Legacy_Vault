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
                .filter(o -> o instanceof BusinessException e && e.getErrorCode() == ErrorCode.RATE_LIMITED).count();
        assertThat(admitted).as("attempts admitted").isEqualTo(5);
        assertThat(blocked).as("attempts rejected with 429").isEqualTo(PARALLEL - 5);
    }

    @Test
    void aSuccessfulLoginReleasesItsReservation() {
        LoginAttemptLimiter limiter = context.getBean(LoginAttemptLimiter.class);
        String email = UUID.randomUUID() + "@example.test";

        for (int i = 0; i < 20; i++) {
            long id = limiter.reserveAttempt(email, null);
            limiter.releaseAttempt(id);
        }

        // 20 successful logins in a row never reach the limit of 5.
        limiter.reserveAttempt(email, null);
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
