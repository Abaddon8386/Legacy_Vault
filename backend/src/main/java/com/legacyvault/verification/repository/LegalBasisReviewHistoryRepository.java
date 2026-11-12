
package com.legacyvault.verification.repository;

import com.legacyvault.verification.entity.LegalBasisReviewHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Bảng lịch sử review hồ sơ căn cứ ({@code LegalBasisReviewHistory}); chỉ ghi thêm. Dùng bởi
 * {@code LegalBasisReviewService}, {@code LegalApprovalService} và {@code GroupHandoverService}.
 */
public interface LegalBasisReviewHistoryRepository
        extends JpaRepository<LegalBasisReviewHistory, Long> {

    /**
     * Toàn bộ lịch sử review của hồ sơ, mới nhất trước.
     */
    List<LegalBasisReviewHistory>
    findByDossierIdOrderByReviewedAtDesc(Long dossierId);

    /**
     * Mục review mới nhất của một phiên bản có trạng thái nằm trong {@code reviewStatuses}.
     */
    Optional<LegalBasisReviewHistory> findFirstByDossierIdAndVersionNoAndReviewStatusInOrderByIdDesc(
            Long dossierId, Integer versionNo, List<String> reviewStatuses);
    /**
     * Mục review mới nhất của hồ sơ (mọi phiên bản) có trạng thái nằm trong danh sách, ví dụ LEGAL_APPROVED/LEGAL_REJECTED.
     */
    Optional<LegalBasisReviewHistory> findFirstByDossierIdAndReviewStatusInOrderByIdDesc(
            Long dossierId, List<String> reviewStatuses);
}
