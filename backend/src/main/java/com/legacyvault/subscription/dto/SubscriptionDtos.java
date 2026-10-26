package com.legacyvault.subscription.dto;

import com.legacyvault.subscription.entity.SubscriptionPlan;
import com.legacyvault.subscription.service.QuotaPolicy.Usage;
import java.time.Instant;

public final class SubscriptionDtos {
    private SubscriptionDtos() {}
    public enum PlanCode { BASIC, STANDARD, EXTENDED }
    public record UpgradeRequest(@jakarta.validation.constraints.NotNull PlanCode planCode,
        @jakarta.validation.constraints.NotNull @jakarta.validation.constraints.Min(1) Integer catalogVersion) {}
    public record UpgradeResponse(Current subscription, long priceDifferenceVnd, boolean changed) {}
    public record UpgradeQuote(String planCode, int catalogVersion, long amountVnd, String currency,
                               String billingModel, long previousPurchaseCreditVnd, boolean paymentAvailable) {}
    public record Limits(long assetCount, long storageBytes, long fileBytes) {}
    public record Plan(String code, int version, long priceVnd, String billingModel, Limits limits) {
        public static Plan from(SubscriptionPlan plan) {
            return new Plan(plan.getCode(), plan.getVersion(), plan.getPriceVnd(), plan.getBillingModel(),
                    new Limits(plan.getAssetLimit(), plan.getStorageLimitBytes(), plan.getFileLimitBytes()));
        }
    }
    /**
     * {@code assetCount} is the number counted against the plan limit and includes wills (D-API-42);
     * {@code willCount} and {@code assetOnlyCount} (= assetCount - willCount) explain that total.
     */
    public record UsageView(long assetCount, long storageBytes, long willCount, long assetOnlyCount) {
        public static UsageView from(Usage usage, long wills) {
            long safeWills = Math.min(Math.max(wills, 0), usage.assets());
            return new UsageView(usage.assets(), usage.bytes(), safeWills, usage.assets() - safeWills);
        }
    }
    public record OverQuota(boolean assets, boolean storage) {}
    public record Current(Plan effectivePlan, Instant effectiveUntil, UsageView usage,
                          OverQuota overQuota, boolean vaultCreated, Instant evaluatedAt) {}
}
