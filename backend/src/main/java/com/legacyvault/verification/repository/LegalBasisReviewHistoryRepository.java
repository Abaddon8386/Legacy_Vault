
package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.LegalBasisReviewHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface LegalBasisReviewHistoryRepository
        extends JpaRepository<LegalBasisReviewHistory, Long> {

    List<LegalBasisReviewHistory>
    findByDossierIdOrderByReviewedAtDesc(Long dossierId);

    Optional<LegalBasisReviewHistory> findFirstByDossierIdAndVersionNoAndReviewStatusInOrderByIdDesc(
            Long dossierId, Integer versionNo, List<String> reviewStatuses);
}
