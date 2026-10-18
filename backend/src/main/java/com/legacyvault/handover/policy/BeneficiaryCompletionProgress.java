package com.legacyvault.handover.policy;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;

/**
 * Pure PS-69 calculation over a single session/approval snapshot.
 * Relevant recipients come from approved scope, not all designated beneficiaries.
 * Confirmed IDs must come from explicit reconciliation records, never delivery.
 * The caller is responsible for authorization, valid approval and consistent reads.
 */
public record BeneficiaryCompletionProgress(int confirmed, int total) {
    public BeneficiaryCompletionProgress {
        if (confirmed < 0 || total < 0 || confirmed > total) {
            throw new IllegalArgumentException("Invalid beneficiary completion counts");
        }
    }

    public static BeneficiaryCompletionProgress from(Collection<UUID> relevantBeneficiaryIds,
                                                       Collection<UUID> confirmedBeneficiaryIds) {
        var relevant = Set.copyOf(relevantBeneficiaryIds);
        var confirmed = Set.copyOf(confirmedBeneficiaryIds);
        int count = 0;
        for (var id : relevant) {
            if (confirmed.contains(id)) count++;
        }
        return new BeneficiaryCompletionProgress(count, relevant.size());
    }

    public int pending() {
        return total - confirmed;
    }

    /** An empty recipient scope is not evidence of complete reconciliation. */
    public boolean allConfirmed() {
        return total > 0 && confirmed == total;
    }
}
