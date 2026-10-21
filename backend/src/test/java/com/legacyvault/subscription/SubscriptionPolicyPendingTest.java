package com.legacyvault.subscription;

import com.legacyvault.common.error.*;
import com.legacyvault.subscription.repository.*;
import com.legacyvault.subscription.service.*;
import com.legacyvault.user.repository.OwnerWriteLockRepository;
import com.legacyvault.vault.repository.VaultRepository;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SubscriptionPolicyPendingTest {
    @Test
    void missingConfigurationDefaultsToNoProposedQuotaEnforcement() {
        var locks=mock(OwnerWriteLockRepository.class);
        var plans=mock(SubscriptionPlanRepository.class);
        var usage=mock(OwnerUsageRepository.class);
        var vaults=mock(VaultRepository.class);
        var quotas=new OwnerQuotaService(locks,plans,usage,vaults,mock(com.legacyvault.subscription.repository.PaymentRepository.class));
        assertEquals(ErrorCode.SUBSCRIPTION_POLICY_PENDING,
            assertThrows(BusinessException.class,quotas::requirePrototypeEnabled).getErrorCode());
        assertDoesNotThrow(()->quotas.requireGrowth(1L,new QuotaPolicy.Delta(1,1)));
        assertDoesNotThrow(()->quotas.requireFileSize(1L,10485761));
        verifyNoInteractions(locks,plans,usage,vaults);
    }
}
