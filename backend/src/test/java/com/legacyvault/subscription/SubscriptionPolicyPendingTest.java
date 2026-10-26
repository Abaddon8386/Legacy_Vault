package com.legacyvault.subscription;

import com.legacyvault.common.error.*;
import com.legacyvault.subscription.dto.SubscriptionDtos.UsageView;
import com.legacyvault.subscription.repository.*;
import com.legacyvault.subscription.service.*;
import com.legacyvault.user.repository.OwnerWriteLockRepository;
import com.legacyvault.vault.repository.VaultRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** PS-92 (D-API-42): quota enforcement is on unless an operator explicitly switches it off. */
class SubscriptionPolicyPendingTest {
    private static OwnerQuotaService service(OwnerUsageRepository usage, SubscriptionPlanRepository plans,
            com.legacyvault.subscription.repository.PaymentRepository payments) {
        return new OwnerQuotaService(mock(OwnerWriteLockRepository.class), plans, usage, mock(VaultRepository.class), payments);
    }

    @Test
    void missingConfigurationEnforcesTheLifetimeCatalogLimits() {
        var usage = mock(OwnerUsageRepository.class);
        var plans = mock(SubscriptionPlanRepository.class);
        var payments = mock(com.legacyvault.subscription.repository.PaymentRepository.class);
        when(payments.effective(1L)).thenReturn(java.util.Optional.empty());
        var basic = mock(com.legacyvault.subscription.entity.SubscriptionPlan.class);
        when(basic.getAssetLimit()).thenReturn(5L);
        when(basic.getStorageLimitBytes()).thenReturn(104857600L);
        when(basic.getFileLimitBytes()).thenReturn(10485760L);
        when(plans.findById("BASIC")).thenReturn(java.util.Optional.of(basic));
        when(usage.read(1L)).thenReturn(new QuotaPolicy.Usage(5, 10));

        var quotas = service(usage, plans, payments);

        assertDoesNotThrow(quotas::requirePrototypeEnabled);
        assertEquals(ErrorCode.ASSET_QUOTA_EXCEEDED,
            assertThrows(BusinessException.class, () -> quotas.requireGrowth(1L, new QuotaPolicy.Delta(1, 1))).getErrorCode());
        assertEquals(ErrorCode.PAYLOAD_TOO_LARGE,
            assertThrows(BusinessException.class, () -> quotas.requireFileSize(1L, 10485761)).getErrorCode());
        assertDoesNotThrow(() -> quotas.requireGrowth(1L, new QuotaPolicy.Delta(0, -5)));
    }

    @Test
    void explicitKillSwitchDisablesEnforcementWithoutTouchingTheDatabase() {
        var locks = mock(OwnerWriteLockRepository.class);
        var plans = mock(SubscriptionPlanRepository.class);
        var usage = mock(OwnerUsageRepository.class);
        var vaults = mock(VaultRepository.class);
        var quotas = new OwnerQuotaService(locks, plans, usage, vaults, mock(com.legacyvault.subscription.repository.PaymentRepository.class));
        ReflectionTestUtils.setField(quotas, "enforcementEnabled", false);

        assertEquals(ErrorCode.SUBSCRIPTION_POLICY_PENDING,
            assertThrows(BusinessException.class, quotas::requirePrototypeEnabled).getErrorCode());
        assertDoesNotThrow(() -> quotas.requireGrowth(1L, new QuotaPolicy.Delta(1, 1)));
        assertDoesNotThrow(() -> quotas.requireFileSize(1L, 10485761));
        verifyNoInteractions(locks, plans, usage, vaults);
    }

    @Test
    void usageViewSeparatesWillsFromOtherAssetsButKeepsTheCountedTotal() {
        var view = UsageView.from(new QuotaPolicy.Usage(5, 100), 2);
        assertEquals(5, view.assetCount());
        assertEquals(2, view.willCount());
        assertEquals(3, view.assetOnlyCount());
        assertEquals(100, view.storageBytes());
        // A breakdown can never exceed the counted total or go negative.
        assertEquals(0, UsageView.from(new QuotaPolicy.Usage(1, 0), 9).assetOnlyCount());
        assertEquals(0, UsageView.from(new QuotaPolicy.Usage(1, 0), -4).willCount());
    }
}
