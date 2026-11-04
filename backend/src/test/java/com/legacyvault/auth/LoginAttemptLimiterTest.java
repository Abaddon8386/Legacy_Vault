package com.legacyvault.auth;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

class LoginAttemptLimiterTest {
    private static final String IP = "203.0.113.9";
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final LoginAttemptLimiter limiter = new LoginAttemptLimiter(jdbc);

    private void emailFailures(long count) {
        when(jdbc.queryForObject(anyString(), eq(Long.class), anyString(), anyInt())).thenReturn(count);
    }

    @Test
    void permitsBelowThreshold() {
        emailFailures(4L);

        assertDoesNotThrow(() -> limiter.requireAllowed("user@example.test", IP));
    }

    @Test
    void blocksAtFiveFailuresForTheSameEmail() {
        emailFailures(5L);

        BusinessException error = assertThrows(BusinessException.class,
                () -> limiter.requireAllowed("user@example.test", IP));

        assertEquals(ErrorCode.RATE_LIMITED, error.getErrorCode());
        assertEquals(429, error.getErrorCode().status());
    }

    @Test
    void blocksAtFiveFailuresForTheSameIpEvenWithDifferentEmails() {
        // First query (by email hash) and second (by IP) both use (String, int) arguments.
        when(jdbc.queryForObject(anyString(), eq(Long.class), anyString(), anyInt())).thenReturn(0L, 5L);

        BusinessException error = assertThrows(BusinessException.class,
                () -> limiter.requireAllowed("other@example.test", IP));

        assertEquals(ErrorCode.RATE_LIMITED, error.getErrorCode());
    }
}
