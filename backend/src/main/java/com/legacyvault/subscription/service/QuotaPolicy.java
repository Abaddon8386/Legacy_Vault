package com.legacyvault.subscription.service;

import java.util.Objects;

/** Proposed PS-77 delta policy. Pure calculation; not a production authorization/quota guard. */
public final class QuotaPolicy {
    public record Usage(long assets, long bytes) {
        public Usage {
            if (assets < 0 || bytes < 0) throw new IllegalArgumentException("Usage must be nonnegative");
        }
    }

    public record Limits(long assets, long bytes) {
        public Limits {
            if (assets <= 0 || bytes <= 0) throw new IllegalArgumentException("Limits must be positive");
        }
    }

    /** Caller defines which content counts; bytes are explicit, with no MB/GB conversion. */
    public record Delta(long assets, long bytes) {}

    public record Decision(Usage projectedUsage, boolean assetLimitExceeded, boolean storageLimitExceeded) {
        public boolean allowed() {
            return !assetLimitExceeded && !storageLimitExceeded;
        }
    }

    /**
     * Evaluate each dimension independently. Non-increasing usage is permitted even when already
     * over quota. Invalid negative totals and long overflow are rejected, never wrapped or clamped.
     */
    public Decision evaluate(Usage usage, Limits limits, Delta delta) {
        Objects.requireNonNull(usage, "usage");
        Objects.requireNonNull(limits, "limits");
        Objects.requireNonNull(delta, "delta");
        Usage projected = new Usage(Math.addExact(usage.assets(), delta.assets()),
                Math.addExact(usage.bytes(), delta.bytes()));
        return new Decision(projected,
                delta.assets() > 0 && projected.assets() > limits.assets(),
                delta.bytes() > 0 && projected.bytes() > limits.bytes());
    }
}
