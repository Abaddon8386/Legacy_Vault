
package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.LegalBasisReviewHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LegalBasisReviewHistoryRepository
        extends JpaRepository<LegalBasisReviewHistory, Long> {

    List<LegalBasisReviewHistory>
    findByDossierIdOrderByReviewedAtDesc(Long dossierId);
}
