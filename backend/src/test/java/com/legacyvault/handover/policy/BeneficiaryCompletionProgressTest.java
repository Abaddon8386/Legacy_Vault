package com.legacyvault.handover.policy;

import org.junit.jupiter.api.Test;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class BeneficiaryCompletionProgressTest {
    private final UUID a = UUID.randomUUID();
    private final UUID b = UUID.randomUUID();

    @Test
    void unrelatedConfirmationCannotCompensateForPendingRecipient() {
        var progress = BeneficiaryCompletionProgress.from(List.of(a, b), List.of(a, UUID.randomUUID()));
        assertEquals(1, progress.confirmed());
        assertEquals(2, progress.total());
        assertEquals(1, progress.pending());
        assertFalse(progress.allConfirmed());
    }

    @Test
    void multipleAllocationsAndRepeatedConfirmationsCountRecipientOnce() {
        var progress = BeneficiaryCompletionProgress.from(List.of(a, a, b), List.of(a, a));
        assertEquals(new BeneficiaryCompletionProgress(1, 2), progress);
        assertFalse(progress.allConfirmed());
    }

    @Test
    void allRelevantRecipientsExplicitlyConfirmedPasses() {
        var progress = BeneficiaryCompletionProgress.from(List.of(a, b), List.of(b, a));
        assertTrue(progress.allConfirmed());
        assertEquals(0, progress.pending());
    }

    @Test
    void noConfirmationsAndEmptyScopeCannotPass() {
        assertFalse(BeneficiaryCompletionProgress.from(List.of(a), List.of()).allConfirmed());
        assertFalse(BeneficiaryCompletionProgress.from(List.of(), List.of(a)).allConfirmed());
    }

    @Test
    void unavailableOrMalformedDataDoesNotBecomeSuccessfulProgress() {
        assertThrows(NullPointerException.class, () -> BeneficiaryCompletionProgress.from(null, List.of()));
        assertThrows(NullPointerException.class, () -> BeneficiaryCompletionProgress.from(List.of(), null));
        assertThrows(NullPointerException.class, () -> BeneficiaryCompletionProgress.from(Arrays.asList(a, null), List.of()));
        assertThrows(NullPointerException.class, () -> BeneficiaryCompletionProgress.from(List.of(a), Arrays.asList(a, null)));
        assertThrows(IllegalArgumentException.class, () -> new BeneficiaryCompletionProgress(2, 1));
        assertThrows(IllegalArgumentException.class, () -> new BeneficiaryCompletionProgress(0, -1));
    }
}
