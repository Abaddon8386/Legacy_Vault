package com.legacyvault.handover.policy;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * PS-67 value model only; not a persisted confirmation or authorization decision.
 * Delivery cannot create a confirmation. The eventual use case must obtain actor
 * and time from trusted server context and validate the session's approved scope.
 */
public record BeneficiaryConfirmation(UUID sessionId, UUID beneficiaryId, Status status,
                                      UUID confirmedBy, Instant confirmedAt, String reference) {
    public enum Status { PENDING, CONFIRMED }

    public BeneficiaryConfirmation {
        Objects.requireNonNull(sessionId, "sessionId");
        Objects.requireNonNull(beneficiaryId, "beneficiaryId");
        Objects.requireNonNull(status, "status");
        if (status == Status.PENDING) {
            if (confirmedBy != null || confirmedAt != null || reference != null) {
                throw new IllegalArgumentException("Pending confirmation cannot carry confirmation evidence");
            }
        } else {
            Objects.requireNonNull(confirmedBy, "confirmedBy");
            Objects.requireNonNull(confirmedAt, "confirmedAt");
            if (reference == null || reference.isBlank()) {
                throw new IllegalArgumentException("Confirmed beneficiary requires a reference");
            }
        }
    }

    public static BeneficiaryConfirmation pending(UUID sessionId, UUID beneficiaryId) {
        return new BeneficiaryConfirmation(sessionId, beneficiaryId, Status.PENDING, null, null, null);
    }

    // A receipt/reference may be sensitive; do not include it in diagnostic output.
    @Override
    public String toString() {
        return "BeneficiaryConfirmation[sessionId=" + sessionId + ", beneficiaryId=" + beneficiaryId
                + ", status=" + status + "]";
    }
}
