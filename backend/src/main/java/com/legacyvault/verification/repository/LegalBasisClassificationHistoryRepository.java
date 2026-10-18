package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.LegalBasisClassificationHistory;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LegalBasisClassificationHistoryRepository extends JpaRepository<LegalBasisClassificationHistory, Long> {
}
