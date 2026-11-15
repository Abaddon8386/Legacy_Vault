
package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.LegalBasisReviewHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Kho lịch sử review/quyết định của Legal trên hồ sơ căn cứ (append-only).
 */
public interface LegalBasisReviewHistoryRepository
        extends JpaRepository<LegalBasisReviewHistory, Long> {

    /**
     * Lịch sử của hồ sơ, mới nhất trước.
     */
    List<LegalBasisReviewHistory>
    findByDossierIdOrderByReviewedAtDesc(Long dossierId);

    /**
     * Bản ghi mới nhất của một phiên bản có trạng thái nằm trong danh sách (ví dụ LEGAL_APPROVED / LEGAL_REJECTED); dùng để biết quyết định hiện hành của phiên bản đó.
     */
    Optional<LegalBasisReviewHistory> findFirstByDossierIdAndVersionNoAndReviewStatusInOrderByIdDesc(
            Long dossierId, Integer versionNo, List<String> reviewStatuses);
    /**
     * Bản ghi mới nhất của hồ sơ (mọi phiên bản) có trạng thái nằm trong danh sách.
     */
    Optional<LegalBasisReviewHistory> findFirstByDossierIdAndReviewStatusInOrderByIdDesc(
            Long dossierId, List<String> reviewStatuses);
}
