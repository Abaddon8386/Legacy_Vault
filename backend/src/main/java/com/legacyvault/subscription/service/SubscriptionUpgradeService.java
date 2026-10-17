package com.legacyvault.subscription.service;

import com.legacyvault.audit.*;
import com.legacyvault.common.error.*;
import com.legacyvault.subscription.dto.SubscriptionDtos.*;
import com.legacyvault.subscription.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;

@Service
public class SubscriptionUpgradeService {
    private final OwnerQuotaService quotas;
    private final SubscriptionPlanRepository plans;
    private final OwnerSubscriptionRepository entitlements;
    private final AuditService audit;
    public SubscriptionUpgradeService(OwnerQuotaService quotas, SubscriptionPlanRepository plans,
            OwnerSubscriptionRepository entitlements, AuditService audit) {
        this.quotas=quotas; this.plans=plans; this.entitlements=entitlements; this.audit=audit;
    }
    @Transactional
    public UpgradeResponse upgrade(Long owner, UpgradeRequest request) {
        quotas.lockOwner(owner);
        Plan before=quotas.current(owner).effectivePlan();
        Plan target=Plan.from(plans.findById(request.planCode().name()).orElseThrow(
            () -> new BusinessException(ErrorCode.VALIDATION_FAILED)));
        if (target.version()!=request.catalogVersion())
            throw new BusinessException(ErrorCode.SUBSCRIPTION_CATALOG_STALE);
        if (target.equals(before)) return new UpgradeResponse(quotas.current(owner),0,false);
        if (target.priceVnd()<before.priceVnd() || target.limits().assetCount()<before.limits().assetCount()
                || target.limits().storageBytes()<before.limits().storageBytes()
                || target.limits().fileBytes()<before.limits().fileBytes()
                || target.limits().equals(before.limits()))
            throw new BusinessException(ErrorCode.SUBSCRIPTION_DOWNGRADE_NOT_ALLOWED);
        long difference=target.priceVnd()-before.priceVnd();
        entitlements.save(owner,target);
        audit.record(new AuditEvent(AuditAction.SUBSCRIPTION_UPGRADED,AuditActorType.USER,owner,null,
            "OWNER_SUBSCRIPTION",owner,null,null,null,
            Map.of("fromPlan",before.code(),"toPlan",target.code(),"catalogVersion",target.version(),
                "priceDifferenceVnd",difference,"fromLimits",before.limits(),"toLimits",target.limits()),null,null));
        return new UpgradeResponse(quotas.current(owner),difference,true);
    }
}
