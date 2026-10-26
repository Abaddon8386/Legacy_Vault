package com.legacyvault.subscription.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.subscription.dto.SubscriptionDtos.*;
import org.springframework.stereotype.Service;
import com.legacyvault.subscription.repository.SubscriptionPlanRepository;
import org.springframework.transaction.annotation.Transactional;

/** Quotes never grant a plan; verified payment IPN is handled by PaymentService. */
@Service
public class SubscriptionUpgradeService {
    private final SubscriptionPlanRepository plans;
    private final OwnerQuotaService quotas;
    private final VnPayGateway gateway;
    public SubscriptionUpgradeService(SubscriptionPlanRepository plans, OwnerQuotaService quotas, VnPayGateway gateway) {
        this.plans = plans; this.quotas = quotas; this.gateway = gateway;
    }
    /** An informational quote never grants access or creates a successful payment. */
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
    public static long fullTargetPrice(String current, String target, long targetPrice) {
        var tiers = java.util.List.of("BASIC", "STANDARD", "EXTENDED");
        int from = tiers.indexOf(current), to = tiers.indexOf(target);
        if (from < 0 || to < 0 || to <= from || targetPrice <= 0)
            throw new BusinessException(ErrorCode.SUBSCRIPTION_DOWNGRADE_NOT_ALLOWED);
        return targetPrice; // User decision: no credit/proration for any previous purchase.
    }
    public UpgradeResponse upgrade(Long owner, UpgradeRequest request) {
        throw new BusinessException(ErrorCode.SUBSCRIPTION_UPGRADE_UNAVAILABLE);
    }
}
