package com.legacyvault.handover.policy;

import java.util.Collection;
import java.util.Set;

/**
 * Pure PS-68 calculation, never an authorization or close operation.
 * The caller must load both sets for the same valid approval/session snapshot.
 * An asset with multiple recipients belongs in fullyDeliveredAssetIds only after
 * every required delivery for that asset is complete (PS-64/65 responsibility).
 */
public record AssetCompletionProgress(int delivered, int total) {
    public AssetCompletionProgress {
        if (delivered < 0 || total < 0 || delivered > total) {
            throw new IllegalArgumentException("Invalid asset completion counts");
        }
    }

    public static AssetCompletionProgress from(Collection<java.util.UUID> approvedAssetIds,
                                                Collection<java.util.UUID> fullyDeliveredAssetIds) {
        var approved = Set.copyOf(approvedAssetIds);
        var delivered = Set.copyOf(fullyDeliveredAssetIds);
        int count = 0;
        for (var id : approved) {
            if (delivered.contains(id)) count++;
        }
        return new AssetCompletionProgress(count, approved.size());
    }

    public int pending() {
        return total - delivered;
    }

    /** Empty scope does not establish completion; integration must validate scope. */
    public boolean allDelivered() {
        return total > 0 && delivered == total;
    }
}
