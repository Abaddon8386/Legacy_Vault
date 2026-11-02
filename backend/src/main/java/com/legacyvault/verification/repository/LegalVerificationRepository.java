package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.LegalVerification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LegalVerificationRepository
        extends JpaRepository<LegalVerification, Long> {

    boolean existsByDeathDocumentRecordId(Long deathDocumentRecordId);

    List<LegalVerification> findByDeathDocumentRecordIdInOrderByDecidedAtDescVerificationIdDesc(List<Long> recordIds);

    List<LegalVerification> findByDeathDocumentRecordIdOrderByRequestedAtDescVerificationIdDesc(
            Long deathDocumentRecordId
    );
}
