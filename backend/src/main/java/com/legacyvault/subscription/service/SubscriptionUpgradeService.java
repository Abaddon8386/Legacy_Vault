package com.legacyvault.subscription.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.subscription.dto.SubscriptionDtos.*;
import org.springframework.stereotype.Service;
import com.legacyvault.subscription.repository.SubscriptionPlanRepository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Báo giá nâng cấp gói. Báo giá không bao giờ cấp gói; IPN thanh toán đã xác minh do {@link PaymentService} xử lý. Được {@code SubscriptionController} gọi.
 */
@Service
public class SubscriptionUpgradeService {
    /**
     * Catalog gói.
     */
    private final SubscriptionPlanRepository plans;
    /**
     * Lấy gói hiệu lực hiện tại.
     */
    private final OwnerQuotaService quotas;
    /**
     * Cho biết cổng thanh toán có khả dụng không.
     */
    private final VnPayGateway gateway;
    /**
     * Khởi tạo service với các phụ thuộc do Spring inject.
     */
    public SubscriptionUpgradeService(SubscriptionPlanRepository plans, OwnerQuotaService quotas, VnPayGateway gateway) {
        this.plans = plans; this.quotas = quotas; this.gateway = gateway;
    }
    /**
     * Báo giá nâng cấp ({@code POST /api/v1/subscriptions/me/upgrade-quote}), chỉ để tham khảo: không cấp quyền, không tạo thanh toán thành công.
     *
     * @param owner id Owner
     * @param request gói đích và version catalog
     * @return {@link UpgradeQuote}
     * @throws com.legacyvault.common.exception.BusinessException RESOURCE_NOT_FOUND, SUBSCRIPTION_CATALOG_STALE, SUBSCRIPTION_DOWNGRADE_NOT_ALLOWED
     */
    @Transactional
    public UpgradeQuote quote(Long owner, UpgradeRequest request) {
        var current = quotas.current(owner).effectivePlan();
        var target = plans.findById(request.planCode().name())
            .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (!target.isAvailable() || target.getVersion() != request.catalogVersion())
            throw new BusinessException(ErrorCode.SUBSCRIPTION_CATALOG_STALE);
        long amount = fullTargetPrice(current.code(), target.getCode(), target.getPriceVnd());
        return new UpgradeQuote(target.getCode(), target.getVersion(), amount, "VND", "LIFETIME", 0, gateway.available());
    }
    /**
     * Giá đầy đủ của gói đích; chỉ cho nâng lên bậc cao hơn (BASIC < STANDARD < EXTENDED) và giá dương, nếu không SUBSCRIPTION_DOWNGRADE_NOT_ALLOWED.
     * Quyết định nghiệp vụ: không trừ tín dụng / tính theo tỉ lệ cho lần mua trước. Cũng dùng trong {@code PaymentService.create}.
     *
     * @return giá VND của gói đích
     */
    public static long fullTargetPrice(String current, String target, long targetPrice) {
        var tiers = java.util.List.of("BASIC", "STANDARD", "EXTENDED");
        int from = tiers.indexOf(current), to = tiers.indexOf(target);
        if (from < 0 || to < 0 || to <= from || targetPrice <= 0)
            throw new BusinessException(ErrorCode.SUBSCRIPTION_DOWNGRADE_NOT_ALLOWED);
        return targetPrice; // User decision: no credit/proration for any previous purchase.
    }
    /**
     * Nâng cấp trực tiếp không qua thanh toán: luôn bị từ chối.
     *
     * @throws com.legacyvault.common.exception.BusinessException SUBSCRIPTION_UPGRADE_UNAVAILABLE
     */
    public UpgradeResponse upgrade(Long owner, UpgradeRequest request) {
        throw new BusinessException(ErrorCode.SUBSCRIPTION_UPGRADE_UNAVAILABLE);
    }
}
