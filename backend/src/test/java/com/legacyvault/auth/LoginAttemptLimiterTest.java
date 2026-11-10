package com.legacyvault.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
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

    private void emailCount(Long byEmail) {
        when(jdbc.queryForObject(contains("COUNT_BIG"), eq(Long.class), anyString(), anyInt(), anyString(), anyString(),
                anyInt())).thenReturn(byEmail);
    }

    private void reservationId(long id) {
        when(jdbc.queryForObject(contains("INSERT dbo.login_failures"), eq(Long.class), anyString(), anyString()))
                .thenReturn(id);
    }

    @Test
    void reservesAnAttemptBelowTheLimit() {
        lockGranted();
        emailCount(4L);
        reservationId(77L);

        assertEquals(77L, limiter.reserveAttempt("user@example.test", IP));
    }

    @Test
    void blocksAtFiveAttemptsForTheSameEmailAndReservesNothing() {
        lockGranted();
        emailCount(5L);

        BusinessException error = assertThrows(BusinessException.class,
                () -> limiter.reserveAttempt("user@example.test", IP));

        assertEquals(ErrorCode.TOO_MANY_ATTEMPTS, error.getErrorCode());
        assertEquals(429, error.getErrorCode().status());
        verify(jdbc, never()).queryForObject(contains("INSERT dbo.login_failures"), eq(Long.class), anyString(),
                anyString());
    }

    @Test
    void otherEmailsOnTheSameIpAreNotBlockedByAnotherAccountsFailures() {
        lockGranted();
        emailCount(0L);
        reservationId(78L);

        assertEquals(78L, limiter.reserveAttempt("other@example.test", IP));
    }

    @Test
    void failsClosedWhenTheLockCannotBeTaken() {
        when(jdbc.queryForObject(contains("sp_getapplock"), eq(Integer.class), anyString())).thenReturn(-1);

        assertThrows(IllegalStateException.class, () -> limiter.reserveAttempt("user@example.test", IP));
    }

    @Test
    void clearFailuresDeletesEveryFailureOfThatEmailOnly() {
        limiter.clearFailures("user@example.test");

        verify(jdbc).update(eq("DELETE dbo.login_failures WHERE email_hash = ?"), anyString());
    }

    @Test
    void nobodyIsExemptByDefault() {
        lockGranted();
        emailCount(5L);

        assertThrows(BusinessException.class, () -> limiter.reserveAttempt("demo@example.test", IP));
    }

    @Test
    void exemptEmailsAreNeverCountedOrBlockedAndOthersStillAre() {
        LoginAttemptLimiter exempt = new LoginAttemptLimiter(jdbc, " Demo@Example.test , staff@example.test ");

        assertEquals(0L, exempt.reserveAttempt("demo@example.test", IP));
        assertEquals(0L, exempt.reserveAttempt("staff@example.test", IP));
        exempt.clearFailures("demo@example.test");
        verify(jdbc, never()).queryForObject(contains("sp_getapplock"), eq(Integer.class), anyString());
        verify(jdbc, never()).update(anyString(), anyString());

        lockGranted();
        emailCount(5L);
        assertThrows(BusinessException.class, () -> exempt.reserveAttempt("someone@example.test", IP));
    }

    private void ipCount(Long byIp) {
        when(jdbc.queryForObject(contains("client_ip = ?"), eq(Long.class), anyString(), anyInt())).thenReturn(byIp);
    }

    @Test
    void anIpIsAllowedBelowTheLooseLimitEvenWithManyFailuresFromOtherEmails() {
        lockGranted();
        emailCount(0L);
        ipCount(29L);
        reservationId(80L);

        assertEquals(80L, limiter.reserveAttempt("other@example.test", IP));
    }

    @Test
    void anIpIsBlockedAtThirtyFailuresAcrossEmailsAndReservesNothing() {
        lockGranted();
        emailCount(0L);
        ipCount(30L);

        BusinessException error = assertThrows(BusinessException.class,
                () -> limiter.reserveAttempt("other@example.test", IP));

        assertEquals(ErrorCode.RATE_LIMITED, error.getErrorCode());
        assertEquals(429, error.getErrorCode().status());
        verify(jdbc, never()).queryForObject(contains("INSERT dbo.login_failures"), eq(Long.class), anyString(),
                anyString());
    }

    @Test
    void theIpLimitIsConfigurable() {
        LoginAttemptLimiter strict = new LoginAttemptLimiter(jdbc, "", 10);
        lockGranted();
        emailCount(0L);
        ipCount(10L);

        assertThrows(BusinessException.class, () -> strict.reserveAttempt("other@example.test", IP));
    }

    @Test
    void withoutAClientIpOnlyTheEmailIsChecked() {
        lockGranted();
        emailCount(0L);
        reservationId(81L);
        when(jdbc.queryForObject(contains("INSERT dbo.login_failures"), eq(Long.class), anyString(), isNull()))
                .thenReturn(81L);

        assertEquals(81L, limiter.reserveAttempt("other@example.test", null));
        verify(jdbc, never()).queryForObject(contains("client_ip = ?"), eq(Long.class), anyString(), anyInt());
    }
}
