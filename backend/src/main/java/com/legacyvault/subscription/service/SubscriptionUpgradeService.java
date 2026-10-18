package com.legacyvault.subscription.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.subscription.dto.SubscriptionDtos.*;
import org.springframework.stereotype.Service;

/** No entitlement may be granted until an approved payment/confirmation workflow exists. */
@Service
public class SubscriptionUpgradeService {
    public UpgradeResponse upgrade(Long owner, UpgradeRequest request) {
        throw new BusinessException(ErrorCode.SUBSCRIPTION_UPGRADE_UNAVAILABLE);
    }
}
