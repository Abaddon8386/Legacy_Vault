package com.legacyvault.subscription.dto;

import com.legacyvault.subscription.entity.SubscriptionPlan;
import com.legacyvault.subscription.service.QuotaPolicy.Usage;
import java.time.Instant;

public final class SubscriptionDtos {
    private SubscriptionDtos() {}
    public record Limits(long assetCount, long storageBytes, long fileBytes) {}
    public record Plan(String code, int version, long monthlyPriceVnd, Limits limits) {
        public static Plan from(SubscriptionPlan plan) {
            return new Plan(plan.getCode(), plan.getVersion(), plan.getMonthlyPriceVnd(),
                    new Limits(plan.getAssetLimit(), plan.getStorageLimitBytes(), plan.getFileLimitBytes()));
        }
    }
    public record UsageView(long assetCount, long storageBytes) {
        public static UsageView from(Usage usage) { return new UsageView(usage.assets(), usage.bytes()); }
    }
    public record OverQuota(boolean assets, boolean storage) {}
    public record Current(Plan effectivePlan, Instant effectiveUntil, UsageView usage,
                          OverQuota overQuota, boolean vaultCreated, Instant evaluatedAt) {}
}
