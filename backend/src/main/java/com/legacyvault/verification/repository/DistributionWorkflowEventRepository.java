package com.legacyvault.verification.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.legacyvault.verification.entity.DistributionWorkflowEvent;

/**
 * Kho sự kiện của quy trình phân phối. Phase của quy trình được suy ra từ chuỗi sự kiện này (append-only), xem DistributionWorkflowService.
 */
public interface DistributionWorkflowEventRepository extends JpaRepository<DistributionWorkflowEvent, Long> {

    /**
     * Toàn bộ sự kiện của ca theo thứ tự eventNo tăng dần (thứ tự phát sinh).
     */
    List<DistributionWorkflowEvent> findByVerificationCaseIdOrderByEventNoAsc(Long verificationCaseId);
}
