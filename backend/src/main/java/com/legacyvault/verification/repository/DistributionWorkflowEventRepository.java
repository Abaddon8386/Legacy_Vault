package com.legacyvault.verification.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.legacyvault.verification.entity.DistributionWorkflowEvent;

/**
 * Repository nhật ký sự kiện quy trình phân chia ({@code DistributionWorkflowEvent}); dùng bởi {@code DistributionWorkflowService}.
 */
public interface DistributionWorkflowEventRepository extends JpaRepository<DistributionWorkflowEvent, Long> {

    /**
     * Các sự kiện của ca theo thứ tự {@code eventNo} tăng dần (dựng lại giai đoạn hiện tại).
     */
    List<DistributionWorkflowEvent> findByVerificationCaseIdOrderByEventNoAsc(Long verificationCaseId);
}
