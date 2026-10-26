package com.legacyvault.handover.policy;

import org.junit.jupiter.api.Test;
import static com.legacyvault.handover.policy.DualCompletionGate.Result.*;
import static org.junit.jupiter.api.Assertions.*;

class DualCompletionGateTest {
    @Test
    void bothCompleteIsReady() {
        assertEquals(READY, DualCompletionGate.evaluate(7, 7, 3, 3));
    }

    @Test
    void deliveredAssetsCannotCompensateForPendingBeneficiary() {
        assertEquals(BENEFICIARIES_PENDING, DualCompletionGate.evaluate(7, 7, 2, 3));
    }

    @Test
    void confirmedBeneficiariesCannotCompensateForPendingAsset() {
        assertEquals(ASSETS_PENDING, DualCompletionGate.evaluate(6, 7, 3, 3));
    }

    @Test
    void bothPendingCannotPass() {
        assertEquals(BOTH_PENDING, DualCompletionGate.evaluate(0, 7, 0, 3));
    }

    @Test
    void emptyScopeDoesNotEstablishCompletion() {
        assertEquals(EMPTY_SCOPE, DualCompletionGate.evaluate(0, 0, 0, 0));
        assertEquals(EMPTY_SCOPE, DualCompletionGate.evaluate(0, 0, 1, 1));
        assertEquals(EMPTY_SCOPE, DualCompletionGate.evaluate(1, 1, 0, 0));
    }

    @Test
    void nearCompleteCannotRoundUpOrOverflow() {
        assertEquals(ASSETS_PENDING, DualCompletionGate.evaluate(Long.MAX_VALUE - 1, Long.MAX_VALUE, 1, 1));
        assertEquals(BENEFICIARIES_PENDING, DualCompletionGate.evaluate(1, 1, Long.MAX_VALUE - 1, Long.MAX_VALUE));
        assertEquals(READY, DualCompletionGate.evaluate(Long.MAX_VALUE, Long.MAX_VALUE, Long.MAX_VALUE, Long.MAX_VALUE));
    }

    @Test
    void corruptCountsAreRejectedEvenWhenTheOtherScopeIsEmpty() {
        for (long[] counts : new long[][]{{-1, 1, 1, 1}, {1, -1, 1, 1}, {2, 1, 1, 1},
                {1, 1, -1, 1}, {1, 1, 1, -1}, {0, 0, 2, 1}}) {
            assertThrows(IllegalArgumentException.class,
                    () -> DualCompletionGate.evaluate(counts[0], counts[1], counts[2], counts[3]));
        }
    }
}
