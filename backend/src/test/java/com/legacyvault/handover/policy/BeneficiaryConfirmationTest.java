package com.legacyvault.handover.policy;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static com.legacyvault.handover.policy.BeneficiaryConfirmation.Status.*;
import static org.junit.jupiter.api.Assertions.*;

class BeneficiaryConfirmationTest {
    private final UUID session = UUID.randomUUID();
    private final UUID beneficiary = UUID.randomUUID();
    private final UUID actor = UUID.randomUUID();
    private final Instant time = Instant.parse("2026-10-18T02:00:00Z");

    @Test
    void pendingHasNoConfirmationEvidence() {
        var value = BeneficiaryConfirmation.pending(session, beneficiary);
        assertEquals(PENDING, value.status());
        assertNull(value.confirmedBy());
        assertNull(value.confirmedAt());
        assertNull(value.reference());
    }

    @Test
    void pendingRejectsEveryKindOfConfirmationEvidence() {
        assertThrows(IllegalArgumentException.class, () -> value(PENDING, actor, null, null));
        assertThrows(IllegalArgumentException.class, () -> value(PENDING, null, time, null));
        assertThrows(IllegalArgumentException.class, () -> value(PENDING, null, null, "receipt-1"));
    }

    @Test
    void confirmedRequiresActorTimeAndNonblankReference() {
        assertThrows(NullPointerException.class, () -> value(CONFIRMED, null, time, "receipt-1"));
        assertThrows(NullPointerException.class, () -> value(CONFIRMED, actor, null, "receipt-1"));
        for (String ref : new String[]{null, "", " \t"}) {
            assertThrows(IllegalArgumentException.class, () -> value(CONFIRMED, actor, time, ref));
        }
    }

    @Test
    void retainsSessionRecipientAndEvidenceWithoutChangingOtherRecipients() {
        var other = BeneficiaryConfirmation.pending(session, UUID.randomUUID());
        var confirmed = value(CONFIRMED, actor, time, "receipt-1");
        assertEquals(session, confirmed.sessionId());
        assertEquals(beneficiary, confirmed.beneficiaryId());
        assertEquals(actor, confirmed.confirmedBy());
        assertEquals(time, confirmed.confirmedAt());
        assertEquals("receipt-1", confirmed.reference());
        assertEquals(PENDING, other.status());
        assertFalse(confirmed.toString().contains("receipt-1"));
    }

    @Test
    void identityAndStatusCannotBeMissing() {
        assertThrows(NullPointerException.class, () -> BeneficiaryConfirmation.pending(null, beneficiary));
        assertThrows(NullPointerException.class, () -> BeneficiaryConfirmation.pending(session, null));
        assertThrows(NullPointerException.class, () -> value(null, null, null, null));
    }

    private BeneficiaryConfirmation value(BeneficiaryConfirmation.Status status, UUID by,
                                           Instant at, String ref) {
        return new BeneficiaryConfirmation(session, beneficiary, status, by, at, ref);
    }
}
