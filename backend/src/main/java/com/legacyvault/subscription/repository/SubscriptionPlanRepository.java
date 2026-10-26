package com.legacyvault.subscription.repository;

import com.legacyvault.subscription.entity.SubscriptionPlan;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SubscriptionPlanRepository extends Repository<SubscriptionPlan, String> {
    Optional<SubscriptionPlan> findById(String code);
    List<SubscriptionPlan> findAllByOrderByAssetLimitAsc();

    @Modifying
    @Query(value = "UPDATE dbo.subscription_plans SET catalog_version = :ver, purchase_price_vnd = :price, billing_model = 'LIFETIME', is_available = 1, asset_limit = :assets, storage_limit_bytes = :storage, file_limit_bytes = :file WHERE plan_code = :code", nativeQuery = true)
    int updatePlanConfig(
        @Param("code") String code,
        @Param("ver") int ver,
        @Param("price") long price,
        @Param("assets") long assets,
        @Param("storage") long storage,
        @Param("file") long file
    );
    @Modifying
    @Query(value = "UPDATE dbo.subscription_plans SET is_available=0 WHERE plan_code=:code AND catalog_version=:version", nativeQuery=true)
    int retire(@Param("code") String code, @Param("version") int version);

    @Query(value="SELECT plan_code FROM dbo.subscription_plans WITH (UPDLOCK, HOLDLOCK) WHERE plan_code=:code", nativeQuery=true)
    String lockPlan(@Param("code") String code);
}
