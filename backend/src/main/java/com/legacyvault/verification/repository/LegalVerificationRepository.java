package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.LegalVerification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Kho quyết định thẩm định pháp lý (chứng tử) của Legal.
 */
public interface LegalVerificationRepository
        extends JpaRepository<LegalVerification, Long> {

    /**
     * Giấy tờ đã có quyết định chưa; mỗi giấy tờ chỉ được quyết định một lần (LEGAL_VERIFICATION_ALREADY_DECIDED).
     */
    boolean existsByDeathDocumentRecordId(Long deathDocumentRecordId);

    List<LegalVerification> findByDeathDocumentRecordIdInOrderByDecidedAtDescVerificationIdDesc(List<Long> recordIds);

    List<LegalVerification> findByDeathDocumentRecordIdOrderByRequestedAtDescVerificationIdDesc(
            Long deathDocumentRecordId
    );
}
