package com.legacyvault.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

/** Logic of the limiter against a mocked JdbcTemplate; the concurrent behaviour is in LoginAttemptLimiterSqlServerTest. */
class LoginAttemptLimiterTest {
    private static final String IP = "203.0.113.9";
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final LoginAttemptLimiter limiter = new LoginAttemptLimiter(jdbc);

    private void lockGranted() {
        when(jdbc.queryForObject(contains("sp_getapplock"), eq(Integer.class), anyString())).thenReturn(0);
    }

    /** Counts returned in call order: first by email hash, then by IP. */
    private void counts(Long byEmail, Long byIp) {
        when(jdbc.queryForObject(anyString(), eq(Long.class), anyString(), anyInt())).thenReturn(byEmail, byIp);
    }

    private void reservationId(long id) {
        when(jdbc.queryForObject(contains("INSERT dbo.login_failures"), eq(Long.class), anyString(), anyString()))
                .thenReturn(id);
    }

    @Test
    void reservesAnAttemptBelowTheLimit() {
        lockGranted();
        counts(4L, 4L);
        reservationId(77L);

        assertEquals(77L, limiter.reserveAttempt("user@example.test", IP));
    }

    @Test
    void blocksAtFiveAttemptsForTheSameEmailAndReservesNothing() {
        lockGranted();
        counts(5L, 0L);

        BusinessException error = assertThrows(BusinessException.class,
                () -> limiter.reserveAttempt("user@example.test", IP));

        assertEquals(ErrorCode.RATE_LIMITED, error.getErrorCode());
        assertEquals(429, error.getErrorCode().status());
        verify(jdbc, never()).queryForObject(contains("INSERT dbo.login_failures"), eq(Long.class), anyString(),
                anyString());
    }

    @Test
    void blocksAtFiveAttemptsForTheSameIpEvenWithDifferentEmails() {
        lockGranted();
        counts(0L, 5L);

        BusinessException error = assertThrows(BusinessException.class,
                () -> limiter.reserveAttempt("other@example.test", IP));

        assertEquals(ErrorCode.RATE_LIMITED, error.getErrorCode());
    }

    @Test
    void failsClosedWhenTheLockCannotBeTaken() {
        when(jdbc.queryForObject(contains("sp_getapplock"), eq(Integer.class), anyString())).thenReturn(-1);

        assertThrows(IllegalStateException.class, () -> limiter.reserveAttempt("user@example.test", IP));
    }

    @Test
    void releaseDeletesOnlyThatReservation() {
        limiter.releaseAttempt(77L);

        verify(jdbc).update("DELETE dbo.login_failures WHERE failure_id = ?", 77L);
    }
}
