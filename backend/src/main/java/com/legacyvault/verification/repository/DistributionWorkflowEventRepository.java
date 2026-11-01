package com.legacyvault.verification.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.legacyvault.verification.entity.DistributionWorkflowEvent;

public interface DistributionWorkflowEventRepository extends JpaRepository<DistributionWorkflowEvent, Long> {

    List<DistributionWorkflowEvent> findByVerificationCaseIdOrderByEventNoAsc(Long verificationCaseId);
}
