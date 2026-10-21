package com.legacyvault.beneficiary;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

class InvitationRedeemAttemptLimiterTest {
    private static final Long ACCOUNT_ID = 31L;
    private static final String CODE_HASH = "f".repeat(64);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final InvitationRedeemAttemptLimiter limiter = new InvitationRedeemAttemptLimiter(jdbc);

    @Test
    void permitsWhenBothBucketsAreBelowThreshold() {
        when(jdbc.queryForObject(anyString(), eq(Long.class), eq(ACCOUNT_ID))).thenReturn(4L);
        when(jdbc.queryForObject(anyString(), eq(Long.class), eq(ACCOUNT_ID), eq(CODE_HASH))).thenReturn(3L);

        assertDoesNotThrow(() -> limiter.requireAllowed(ACCOUNT_ID, CODE_HASH));
    }

    @Test
    void accountThresholdStillApplies() {
        when(jdbc.queryForObject(anyString(), eq(Long.class), eq(ACCOUNT_ID))).thenReturn(5L);

        BusinessException error = assertThrows(BusinessException.class,
                () -> limiter.requireAllowed(ACCOUNT_ID, CODE_HASH));

        assertEquals(ErrorCode.TOO_MANY_ATTEMPTS, error.getErrorCode());
    }

    @Test
    void invitationBucketIsScopedToAccountAndInvitation() {
        when(jdbc.queryForObject(anyString(), eq(Long.class), eq(ACCOUNT_ID))).thenReturn(0L);
        when(jdbc.queryForObject(anyString(), eq(Long.class), eq(ACCOUNT_ID), eq(CODE_HASH))).thenReturn(5L);

        BusinessException error = assertThrows(BusinessException.class,
                () -> limiter.requireAllowed(ACCOUNT_ID, CODE_HASH));

        assertEquals(ErrorCode.TOO_MANY_ATTEMPTS, error.getErrorCode());
    }

    @Test
    void oneAccountsFailuresDoNotBlockAnotherAccountsUseOfTheSameInvitation() {
        Long attacker = 51L;
        Long recipient = 52L;
        when(jdbc.queryForObject(anyString(), eq(Long.class), eq(attacker))).thenReturn(5L);
        when(jdbc.queryForObject(anyString(), eq(Long.class), eq(recipient))).thenReturn(0L);
        when(jdbc.queryForObject(anyString(), eq(Long.class), eq(recipient), eq(CODE_HASH))).thenReturn(0L);

        assertThrows(BusinessException.class, () -> limiter.requireAllowed(attacker, CODE_HASH));
        assertDoesNotThrow(() -> limiter.requireAllowed(recipient, CODE_HASH));
    }
}
