package com.legacyvault.subscription.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.subscription.dto.SubscriptionDtos.*;
import com.legacyvault.subscription.entity.SubscriptionPlan;
import com.legacyvault.subscription.repository.OwnerUsageRepository;
import com.legacyvault.subscription.repository.SubscriptionPlanRepository;
import com.legacyvault.subscription.service.QuotaPolicy.*;
import com.legacyvault.user.repository.OwnerWriteLockRepository;
import com.legacyvault.vault.repository.VaultRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;

/** Quota enforcement remains opt-in; paid access comes only from verified payment snapshots. */
@Service
public class OwnerQuotaService {
    private final OwnerWriteLockRepository ownerLocks;
    private final SubscriptionPlanRepository plans;
    private final OwnerUsageRepository usage;
    private final VaultRepository vaults;
    private final com.legacyvault.subscription.repository.PaymentRepository payments;
    /** PS-92 (D-API-42): the lifetime catalog limits are enforced by default; the flag is an operational kill switch only. */
    @org.springframework.beans.factory.annotation.Value("${legacyvault.subscription.quota-enforcement-enabled:true}")
    private boolean enforcementEnabled = true;

    public void requirePrototypeEnabled() {
        if (!enforcementEnabled) throw new BusinessException(ErrorCode.SUBSCRIPTION_POLICY_PENDING);
    }

    private final QuotaPolicy policy = new QuotaPolicy();

    public OwnerQuotaService(OwnerWriteLockRepository ownerLocks, SubscriptionPlanRepository plans,
                             OwnerUsageRepository usage, VaultRepository vaults,
                             com.legacyvault.subscription.repository.PaymentRepository payments) {
        this.ownerLocks = ownerLocks;
        this.plans = plans;
        this.usage = usage;
        this.vaults = vaults;
        this.payments = payments;
    }

    /** Must precede any resource write lock and remain held through the caller's commit. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void lockOwner(Long ownerUserId) {
        ownerLocks.findActiveOwnerForUpdate(ownerUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHENTICATED));
    }

    /** Caller holds the Owner lock. No REQUIRES_NEW: checks and writes share one transaction. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void requireGrowth(Long ownerUserId, Delta delta) {
        if (!enforcementEnabled) return;
        Plan plan = effective(ownerUserId);
        Decision decision = policy.evaluate(usage.read(ownerUserId),
                new QuotaPolicy.Limits(plan.limits().assetCount(), plan.limits().storageBytes()), delta);
        if (decision.assetLimitExceeded()) throw new BusinessException(ErrorCode.ASSET_QUOTA_EXCEEDED);
        if (decision.storageLimitExceeded()) throw new BusinessException(ErrorCode.STORAGE_QUOTA_EXCEEDED);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void requireFileSize(Long ownerUserId, long bytes) {
        if (!enforcementEnabled) return;
        if (bytes > effective(ownerUserId).limits().fileBytes()) throw new BusinessException(ErrorCode.PAYLOAD_TOO_LARGE);
    }

    @Transactional(readOnly = true)
    public List<Plan> catalog() {
        return plans.findAllByOrderByAssetLimitAsc().stream().filter(SubscriptionPlan::isAvailable).map(Plan::from).toList();
    }

    @Transactional
    public Current current(Long ownerUserId) {
        lockOwner(ownerUserId);
        Plan plan = effective(ownerUserId);
        Usage observed = usage.read(ownerUserId);
        long wills = usage.willCount(ownerUserId);
        return new Current(plan, null, UsageView.from(observed, wills),
                new OverQuota(observed.assets() > plan.limits().assetCount(), observed.bytes() > plan.limits().storageBytes()),
                vaults.existsByOwnerUserId(ownerUserId), Instant.now());
    }

    private Plan effective(Long ownerUserId) {
        // Never trust pre-review self-granted rows as proof of payment/authorization.
        return payments.effective(ownerUserId).orElseGet(() -> Plan.from(basic()));
    }

    private SubscriptionPlan basic() {
        return plans.findById("BASIC").orElseThrow(() -> new IllegalStateException("BASIC catalog entry is required"));
    }
}
