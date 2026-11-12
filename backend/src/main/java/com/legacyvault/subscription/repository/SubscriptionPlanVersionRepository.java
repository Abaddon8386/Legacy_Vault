package com.legacyvault.subscription.repository;

import com.legacyvault.subscription.entity.SubscriptionPlanVersion;
import com.legacyvault.subscription.entity.SubscriptionPlanVersion.VersionStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * Repository JPA cho {@code subscription_plan_versions}, dùng bởi {@code AdminSubscriptionService}.
 */
public interface SubscriptionPlanVersionRepository extends JpaRepository<SubscriptionPlanVersion, Long> {
    /**
     * Mọi version của một gói, mới nhất trước.
     */
    List<SubscriptionPlanVersion> findByPlanCodeOrderByVersionDesc(String planCode);
    /**
     * Một version cụ thể của gói.
     */
    Optional<SubscriptionPlanVersion> findByPlanCodeAndVersion(String planCode, int version);
    /**
     * Version của gói theo trạng thái (vd bản PUBLISHED hiện tại).
     */
    Optional<SubscriptionPlanVersion> findByPlanCodeAndStatus(String planCode, VersionStatus status);
    /**
     * Mọi version của mọi gói.
     */
    List<SubscriptionPlanVersion> findAllByOrderByPlanCodeAscVersionDesc();
    /**
     * Gói có version ở trạng thái này không (kiểm tra đã có bản nháp).
     */
    boolean existsByPlanCodeAndStatus(String planCode, VersionStatus status);

    /**
     * Số version lớn nhất của gói (0 nếu chưa có), để cấp số version kế tiếp.
     */
    @Query("SELECT COALESCE(MAX(v.version), 0) FROM SubscriptionPlanVersion v WHERE v.planCode = :planCode")
    int findMaxVersion(@Param("planCode") String planCode);
}
