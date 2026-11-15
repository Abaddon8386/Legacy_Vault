package com.legacyvault.verification.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.LegalBasisReviewHistory;
import com.legacyvault.verification.repository.AllocationRow;
import com.legacyvault.verification.repository.CourtEvidenceVersion;
import com.legacyvault.verification.repository.LegalBasisReviewHistoryRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;

/**
 * Xác minh phê duyệt Legal mới nhất vẫn phủ đúng snapshot dossier có thẩm quyền.
 * Việc mất hiệu lực được suy ra từ bản ghi version/scope bất biến và các thay đổi dossier đã audit;
 * cổng chỉ đọc này tránh ghi sự kiện mất hiệu lực trùng lặp cho các lần thử chuyển trạng thái lặp lại.
 */
@Component
public class LegalApprovalGuard {
    private static final String APPROVED = "LEGAL_APPROVED";
    private static final String REJECTED = "LEGAL_REJECTED";
    private static final String APPROVE_REASON_CODE = "APPROVE";

    private final LegalBasisReviewHistoryRepository history;
    private final LegalBasisVersionAllocationRepository allocations;

    public LegalApprovalGuard(LegalBasisReviewHistoryRepository history,
            LegalBasisVersionAllocationRepository allocations) {
        this.history = history;
        this.allocations = allocations;
    }

    /**
     * Cổng ghi: ném BusinessException nếu phê duyệt Legal mới nhất không còn phủ đúng snapshot hiện tại. Bắt buộc chạy trong transaction có sẵn.
     * @throws BusinessException LEGAL_DECISION_STALE hoặc LEGAL_APPROVAL_REQUIRED
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void requireCurrentApproval(LegalBasisDossier dossier, CourtEvidenceVersion currentVersion) {
        ErrorCode blocker = currentApprovalBlocker(dossier, currentVersion);
        if (blocker != null) throw new BusinessException(blocker);
    }

    /**
     * Cùng quy tắc với cổng ghi, nhưng không ném exception qua transactional proxy trong GET.
     *
     * Xác định lý do chặn của phê duyệt hiện hành, null nếu hợp lệ.
     * Thứ tự: (1) review snapshot phải còn FRESH và khớp phiên bản/hash/tranh chấp/phân bổ -> nếu không là LEGAL_DECISION_STALE;
     * (2) chưa có quyết định hoặc quyết định mới nhất là REJECTED -> LEGAL_APPROVAL_REQUIRED;
     * (3) quyết định APPROVE phải khớp đúng version id, sha256, dispute status và allocation hash hiện tại -> nếu lệch là LEGAL_DECISION_STALE.
     */
    public ErrorCode currentApprovalBlocker(LegalBasisDossier dossier, CourtEvidenceVersion currentVersion) {
        String currentAllocationHash = allocationHash(dossier.getLegalBasisDossierId(), currentVersion.version());
        if (!reviewMatches(dossier, currentVersion, currentAllocationHash)) {
            return ErrorCode.LEGAL_DECISION_STALE;
        }

        LegalBasisReviewHistory decision = history
                .findFirstByDossierIdAndVersionNoAndReviewStatusInOrderByIdDesc(
                        dossier.getLegalBasisDossierId(), currentVersion.version(), List.of(APPROVED, REJECTED))
                .orElse(null);
        if (decision == null || REJECTED.equals(decision.getReviewStatus())) {
            return ErrorCode.LEGAL_APPROVAL_REQUIRED;
        }
        if (!APPROVED.equals(decision.getReviewStatus())
                || !APPROVE_REASON_CODE.equals(decision.getReasonCode())
                || !Objects.equals(decision.getDossierVersionId(), currentVersion.id())
                || !sameHash(decision.getSha256Hash(), currentVersion.sha256())
                || !Objects.equals(decision.getDisputeStatus(), dossier.getDisputeStatus())
                || !sameHash(decision.getAllocationHash(), currentAllocationHash)) {
            return ErrorCode.LEGAL_DECISION_STALE;
        }
        return null;
    }

    /**
     * Chỉ kiểm tra snapshot review còn khớp (chưa xét quyết định phê duyệt); null nếu khớp, LEGAL_DECISION_STALE nếu lệch.
     */
    public ErrorCode reviewBlocker(LegalBasisDossier dossier, CourtEvidenceVersion currentVersion) {
        String hash = allocationHash(dossier.getLegalBasisDossierId(), currentVersion.version());
        return reviewMatches(dossier, currentVersion, hash) ? null : ErrorCode.LEGAL_DECISION_STALE;
    }

    /**
     * Review còn hiệu lực khi hồ sơ đủ điều kiện xem xét, phiên bản hiện tại đạt requiredVersionNo, reviewStatus là FRESH
     * và toàn bộ snapshot đã review (version, sha256, dispute status, allocation hash) trùng với dữ liệu hiện tại.
     */
    private static boolean reviewMatches(LegalBasisDossier dossier, CourtEvidenceVersion currentVersion, String hash) {
        return dossier.isLegalReviewable()
            && currentVersion.version() >= dossier.getRequiredVersionNo()
            && "FRESH".equals(dossier.getReviewStatus())
            && Objects.equals(dossier.getLastReviewedVersionNo(), currentVersion.version())
            && sameHash(dossier.getLastReviewedSha256Hash(), currentVersion.sha256())
            && Objects.equals(dossier.getLastReviewedDisputeStatus(), dossier.getDisputeStatus())
            && sameHash(dossier.getLastReviewedAllocationHash(), hash);
    }

    /**
     * Tính allocation hash của phân bổ hiện hành đúng phiên bản, cùng công thức với lúc Legal duyệt (AllocationScopeHash).
     */
    private String allocationHash(Long dossierId, int versionNo) {
        List<AllocationRow> rows = allocations.findRowsByDossier(dossierId).stream()
                .filter(row -> row.versionNo() == versionNo)
                .toList();
        return AllocationScopeHash.hashApprovalRows(rows);
    }

    /**
     * So sánh hash không phân biệt hoa thường; null được coi là không khớp.
     */
    private static boolean sameHash(String first, String second) {
        return first != null && second != null && first.equalsIgnoreCase(second);
    }
}
