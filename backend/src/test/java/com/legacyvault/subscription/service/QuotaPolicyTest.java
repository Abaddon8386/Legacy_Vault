package com.legacyvault.subscription.service;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import com.legacyvault.subscription.service.QuotaPolicy.*;

class QuotaPolicyTest {
    private final QuotaPolicy policy = new QuotaPolicy();
    private final Limits limits = new Limits(5, 100);

    @Test
    void acceptsExactLimitsButRejectsOneUnitMoreInEitherDimension() {
        assertTrue(policy.evaluate(new Usage(4, 99), limits, new Delta(1, 1)).allowed());
        var count = policy.evaluate(new Usage(5, 99), limits, new Delta(1, 1));
        assertTrue(count.assetLimitExceeded());
        assertFalse(count.storageLimitExceeded());
        var storage = policy.evaluate(new Usage(4, 100), limits, new Delta(1, 1));
        assertFalse(storage.assetLimitExceeded());
        assertTrue(storage.storageLimitExceeded());
        assertFalse(storage.allowed());
    }

    @Test
    void permitsUnchangedOrReducedUsageAboveLimitsWithoutClampingData() {
        assertTrue(policy.evaluate(new Usage(7, 120), limits, new Delta(0, 0)).allowed());
        var reduced = policy.evaluate(new Usage(7, 120), limits, new Delta(-1, -10));
        assertTrue(reduced.allowed());
        assertEquals(new Usage(6, 110), reduced.projectedUsage());
    }

    @Test
    void reductionInOneDimensionCannotHideGrowthBeyondOtherLimit() {
        assertTrue(policy.evaluate(new Usage(5, 120), limits, new Delta(1, -30)).assetLimitExceeded());
        assertTrue(policy.evaluate(new Usage(7, 100), limits, new Delta(-3, 1)).storageLimitExceeded());
        var both = policy.evaluate(new Usage(5, 100), limits, new Delta(1, 1));
        assertTrue(both.assetLimitExceeded());
        assertTrue(both.storageLimitExceeded());
    }

    @Test
    void countsEveryRetainedVersionAndUsesReplacementDelta() {
        // Caller supplies the new version's full size, even if smaller than the old version.
        assertFalse(policy.evaluate(new Usage(1, 90), limits, new Delta(0, 20)).allowed());
        assertEquals(new Usage(1, 80),
                policy.evaluate(new Usage(1, 90), limits, new Delta(0, 20 - 30)).projectedUsage());
    }

    @Test
    void rejectsInvalidInputsAndNegativeProjectedUsage() {
        assertThrows(IllegalArgumentException.class, () -> new Usage(-1, 0));
        assertThrows(IllegalArgumentException.class, () -> new Usage(0, -1));
        assertThrows(IllegalArgumentException.class, () -> new Limits(0, 1));
        assertThrows(IllegalArgumentException.class, () -> new Limits(1, 0));
        assertThrows(IllegalArgumentException.class,
                () -> policy.evaluate(new Usage(0, 0), limits, new Delta(-1, 0)));
        assertThrows(IllegalArgumentException.class,
                () -> policy.evaluate(new Usage(0, 0), limits, new Delta(0, Long.MIN_VALUE)));
    }

    @Test
    void rejectsOverflowRatherThanTurningGrowthIntoNegativeUsage() {
        var large = new Limits(Long.MAX_VALUE, Long.MAX_VALUE);
        assertTrue(policy.evaluate(new Usage(Long.MAX_VALUE - 1, Long.MAX_VALUE - 1),
                large, new Delta(1, 1)).allowed());
        assertThrows(ArithmeticException.class,
                () -> policy.evaluate(new Usage(Long.MAX_VALUE, 0), large, new Delta(1, 0)));
        assertThrows(ArithmeticException.class,
                () -> policy.evaluate(new Usage(0, Long.MAX_VALUE), large, new Delta(0, 1)));
    }
}
