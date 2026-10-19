package com.legacyvault.handover.policy;

/**
 * PS-70 AND rule only. Counts must be derived by the server from the same locked
 * session/approval snapshot. READY is a completion result, not authorization to
 * close, proof of approval validity, or a substitute for a database transaction.
 */
public final class DualCompletionGate {
    private DualCompletionGate() { }

    public enum Result { READY, ASSETS_PENDING, BENEFICIARIES_PENDING, BOTH_PENDING, EMPTY_SCOPE }

    public static Result evaluate(long deliveredAssets, long totalAssets,
                                  long confirmedBeneficiaries, long totalBeneficiaries) {
        validate(deliveredAssets, totalAssets);
        validate(confirmedBeneficiaries, totalBeneficiaries);
        if (totalAssets == 0 || totalBeneficiaries == 0) return Result.EMPTY_SCOPE;
        boolean assetsComplete = deliveredAssets == totalAssets;
        boolean beneficiariesComplete = confirmedBeneficiaries == totalBeneficiaries;
        if (assetsComplete && beneficiariesComplete) return Result.READY;
        if (!assetsComplete && !beneficiariesComplete) return Result.BOTH_PENDING;
        return assetsComplete ? Result.BENEFICIARIES_PENDING : Result.ASSETS_PENDING;
    }

    private static void validate(long completed, long total) {
        if (completed < 0 || total < 0 || completed > total) {
            throw new IllegalArgumentException("Invalid completion counts");
        }
    }
}
