package com.legacyvault.subscription.repository;

import com.legacyvault.subscription.entity.SubscriptionPlanVersion;
import com.legacyvault.subscription.entity.SubscriptionPlanVersion.VersionStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SubscriptionPlanVersionRepository extends JpaRepository<SubscriptionPlanVersion, Long> {
    List<SubscriptionPlanVersion> findByPlanCodeOrderByVersionDesc(String planCode);
    Optional<SubscriptionPlanVersion> findByPlanCodeAndVersion(String planCode, int version);
    Optional<SubscriptionPlanVersion> findByPlanCodeAndStatus(String planCode, VersionStatus status);
    List<SubscriptionPlanVersion> findAllByOrderByPlanCodeAscVersionDesc();
    boolean existsByPlanCodeAndStatus(String planCode, VersionStatus status);

    @Query("SELECT COALESCE(MAX(v.version), 0) FROM SubscriptionPlanVersion v WHERE v.planCode = :planCode")
    int findMaxVersion(@Param("planCode") String planCode);
}
