package com.legacyvault.subscription.dto;

import com.legacyvault.subscription.entity.SubscriptionPlan;
import com.legacyvault.subscription.service.QuotaPolicy.Usage;
import java.time.Instant;

/**
 * Nhóm DTO cho API gói đăng ký của Owner (catalog, gói hiệu lực, báo giá nâng cấp).
 */
public final class SubscriptionDtos {
    /**
     * Lớp tiện ích, không khởi tạo.
     */
    private SubscriptionDtos() {}
    /**
     * Mã gói: BASIC, STANDARD, EXTENDED.
     */
    public enum PlanCode { BASIC, STANDARD, EXTENDED }
    /**
     * Body báo giá / nâng cấp: {@code planCode} (bắt buộc) và {@code catalogVersion} (>= 1, phải khớp version catalog hiện tại, nếu không SUBSCRIPTION_CATALOG_STALE).
     */
    public record UpgradeRequest(@jakarta.validation.constraints.NotNull PlanCode planCode,
        @jakarta.validation.constraints.NotNull @jakarta.validation.constraints.Min(1) Integer catalogVersion) {}
    /**
     * Response nâng cấp trực tiếp (hiện không dùng được vì luôn bị từ chối).
     */
    public record UpgradeResponse(Current subscription, long priceDifferenceVnd, boolean changed) {}
    /**
     * Báo giá nâng cấp: gói đích, version catalog, số tiền VND, tiền tệ, mô hình thu phí, tín dụng mua trước ({@code previousPurchaseCreditVnd}, luôn 0) và cổng thanh toán có khả dụng không ({@code paymentAvailable}).
     */
    public record UpgradeQuote(String planCode, int catalogVersion, long amountVnd, String currency,
                               String billingModel, long previousPurchaseCreditVnd, boolean paymentAvailable) {}
    /**
     * Giới hạn gói: số Asset, tổng dung lượng và dung lượng tối đa mỗi file (byte).
     */
    public record Limits(long assetCount, long storageBytes, long fileBytes) {}
    /**
     * Một gói trong catalog: mã, version catalog, giá VND, mô hình thu phí và {@link Limits}.
     */
    public record Plan(String code, int version, long priceVnd, String billingModel, Limits limits) {
        /**
         * Dựng {@link Plan} từ entity {@code SubscriptionPlan}.
         */
        public static Plan from(SubscriptionPlan plan) {
            return new Plan(plan.getCode(), plan.getVersion(), plan.getPriceVnd(), plan.getBillingModel(),
                    new Limits(plan.getAssetLimit(), plan.getStorageLimitBytes(), plan.getFileLimitBytes()));
        }
    }
    /**
     * {@code assetCount} là số tính vào giới hạn gói và đã bao gồm di chúc; {@code willCount} và {@code assetOnlyCount} (= assetCount - willCount) giải thích tổng đó; {@code storageBytes} là dung lượng đã dùng.
     */
    public record UsageView(long assetCount, long storageBytes, long willCount, long assetOnlyCount) {
        /**
         * Dựng {@link UsageView} từ {@code Usage} và số di chúc (kẹp trong khoảng 0..assets).
         */
        public static UsageView from(Usage usage, long wills) {
            long safeWills = Math.min(Math.max(wills, 0), usage.assets());
            return new UsageView(usage.assets(), usage.bytes(), safeWills, usage.assets() - safeWills);
        }
    }
    /**
     * Cờ đang vượt giới hạn: {@code assets} (số Asset) và {@code storage} (dung lượng).
     */
    public record OverQuota(boolean assets, boolean storage) {}
    /**
     * Trạng thái gói của Owner: gói hiệu lực, hạn ({@code effectiveUntil}, null với LIFETIME), mức dùng, cờ vượt quota, đã tạo Vault chưa và thời điểm đánh giá.
     */
    public record Current(Plan effectivePlan, Instant effectiveUntil, UsageView usage,
                          OverQuota overQuota, boolean vaultCreated, Instant evaluatedAt) {}
}
