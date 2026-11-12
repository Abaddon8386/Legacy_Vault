package com.legacyvault.subscription.repository;

import com.legacyvault.subscription.entity.SubscriptionPlan;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * Repository cho catalog {@code subscription_plans} (chỉ đọc qua JPA, ghi bằng native query), dùng bởi {@code OwnerQuotaService}, {@code PaymentService}, {@code SubscriptionUpgradeService}, {@code AdminSubscriptionService}.
 */
public interface SubscriptionPlanRepository extends Repository<SubscriptionPlan, String> {
    /**
     * Tìm gói theo mã.
     */
    Optional<SubscriptionPlan> findById(String code);
    /**
     * Mọi gói theo giới hạn Asset tăng dần.
     */
    List<SubscriptionPlan> findAllByOrderByAssetLimitAsc();

    /**
     * Đồng bộ cấu hình gói đang bán khi admin publish một version (native UPDATE): đặt version, giá, mô hình LIFETIME, các giới hạn và {@code is_available = 1}.
     *
     * @return số dòng cập nhật
     */
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
    /**
     * Ngừng bán một version catalog ({@code is_available = 0}) khi admin deprecate.
     *
     * @return số dòng cập nhật
     */
    @Modifying
    @Query(value = "UPDATE dbo.subscription_plans SET is_available=0 WHERE plan_code=:code AND catalog_version=:version", nativeQuery=true)
    int retire(@Param("code") String code, @Param("version") int version);

    /**
     * Khóa dòng gói (UPDLOCK, HOLDLOCK) để tuần tự hóa việc admin publish với việc chụp giá khi tạo đơn thanh toán.
     *
     * @return mã gói đã khóa
     */
    @Query(value="SELECT plan_code FROM dbo.subscription_plans WITH (UPDLOCK, HOLDLOCK) WHERE plan_code=:code", nativeQuery=true)
    String lockPlan(@Param("code") String code);
}
