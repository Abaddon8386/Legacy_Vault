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
 * Kiểm tra rằng quyết định phê duyệt mới nhất của Legal vẫn còn bao phủ đúng snapshot hồ sơ căn cứ hiện hành.
 *
 * <p>Việc vô hiệu hóa được suy ra từ các bản ghi phiên bản/phạm vi bất biến và các thay đổi dossier đã được audit; guard
 * này chỉ đọc nên không ghi trùng sự kiện vô hiệu hóa khi bị thử chuyển bước nhiều lần. So sánh: dossier còn FRESH,
 * phiên bản/SHA-256/trạng thái tranh chấp/hash phân bổ lần xem xét cuối khớp phiên bản hiện tại, và quyết định mới nhất
 * là LEGAL_APPROVED với lý do APPROVE. Dùng bảng lịch sử xem xét ({@code LegalBasisReviewHistory}) và phân bổ phiên
 * bản; được {@link LegalWorkflowGuard} (trước khi duyệt, mở khóa hoặc bàn giao), {@code LegalReadService} (tính khả năng thao tác của GET context) và {@code DistributionWorkflowService} (xác định trạng thái duyệt) gọi.
 */
@Component
public class LegalApprovalGuard {
    private static final String APPROVED = "LEGAL_APPROVED";
    private static final String REJECTED = "LEGAL_REJECTED";
    private static final String APPROVE_REASON_CODE = "APPROVE";

    private final LegalBasisReviewHistoryRepository history;
    private final LegalBasisVersionAllocationRepository allocations;

    /**
     * @param history repository lịch sử xem xét/quyết định hồ sơ căn cứ
     * @param allocations repository các dòng phân bổ theo phiên bản (để tính hash phạm vi)
     */
    public LegalApprovalGuard(LegalBasisReviewHistoryRepository history,
            LegalBasisVersionAllocationRepository allocations) {
        this.history = history;
        this.allocations = allocations;
    }

    /**
     * Yêu cầu có phê duyệt hiện hành hợp lệ; ném lỗi nếu có chặn.
     *
     * @param dossier hồ sơ căn cứ
     * @param currentVersion phiên bản hồ sơ hiện hành
     * @throws BusinessException {@code LEGAL_DECISION_STALE} khi quyết định đã cũ hoặc {@code LEGAL_APPROVAL_REQUIRED}
     *         khi chưa có quyết định duyệt
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void requireCurrentApproval(LegalBasisDossier dossier, CourtEvidenceVersion currentVersion) {
        ErrorCode blocker = currentApprovalBlocker(dossier, currentVersion);
        if (blocker != null) throw new BusinessException(blocker);
    }

    /**
     * Cùng quy tắc với guard ghi nhưng trả về mã lỗi thay vì ném, dùng cho các request GET.
     *
     * @param dossier hồ sơ căn cứ
     * @param currentVersion phiên bản hồ sơ hiện hành
     * @return {@code LEGAL_DECISION_STALE}, {@code LEGAL_APPROVAL_REQUIRED} hoặc {@code null} nếu không bị chặn
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
     * Chỉ kiểm tra bước xem xét còn khớp snapshot (chưa xét quyết định duyệt/từ chối).
     *
     * @param dossier hồ sơ căn cứ
     * @param currentVersion phiên bản hồ sơ hiện hành
     * @return {@code LEGAL_DECISION_STALE} nếu lệch, ngược lại {@code null}
     */
    public ErrorCode reviewBlocker(LegalBasisDossier dossier, CourtEvidenceVersion currentVersion) {
        String hash = allocationHash(dossier.getLegalBasisDossierId(), currentVersion.version());
        return reviewMatches(dossier, currentVersion, hash) ? null : ErrorCode.LEGAL_DECISION_STALE;
    }

    /**
     * Kiểm tra dossier có thể xem xét, còn FRESH và các giá trị lần xem xét cuối (phiên bản, SHA-256, tranh chấp, hash
     * phân bổ) khớp với phiên bản hiện hành.
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
     * Tính hash phạm vi phân bổ của đúng phiên bản {@code versionNo} trong dossier.
     */
    private String allocationHash(Long dossierId, int versionNo) {
        List<AllocationRow> rows = allocations.findRowsByDossier(dossierId).stream()
                .filter(row -> row.versionNo() == versionNo)
                .toList();
        return AllocationScopeHash.hashApprovalRows(rows);
    }

    /**
     * So sánh hai hash không phân biệt hoa thường; {@code false} nếu một trong hai là null.
     */
    private static boolean sameHash(String first, String second) {
        return first != null && second != null && first.equalsIgnoreCase(second);
    }
}
