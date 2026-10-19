package com.legacyvault.subscription;
import com.legacyvault.subscription.service.SubscriptionUpgradeService;
import com.legacyvault.common.error.BusinessException;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class LifetimeUpgradePriceTest {
    @Test void chargesFullTargetPriceWithoutCreditingPreviousPurchase() {
        assertEquals(499000,SubscriptionUpgradeService.fullTargetPrice("BASIC","STANDARD",499000));
        assertEquals(999000,SubscriptionUpgradeService.fullTargetPrice("BASIC","EXTENDED",999000));
        assertEquals(999000,SubscriptionUpgradeService.fullTargetPrice("STANDARD","EXTENDED",999000));
        assertThrows(BusinessException.class,()->SubscriptionUpgradeService.fullTargetPrice("EXTENDED","STANDARD",499000));
        assertThrows(BusinessException.class,()->SubscriptionUpgradeService.fullTargetPrice("STANDARD","STANDARD",499000));
    }
}
