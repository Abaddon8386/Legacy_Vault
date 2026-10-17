package com.legacyvault.subscription.repository;

import com.legacyvault.subscription.entity.SubscriptionPlan;
import org.springframework.data.repository.Repository;
import java.util.List;
import java.util.Optional;

public interface SubscriptionPlanRepository extends Repository<SubscriptionPlan, String> {
    Optional<SubscriptionPlan> findById(String code);
    List<SubscriptionPlan> findAllByOrderByAssetLimitAsc();
}
