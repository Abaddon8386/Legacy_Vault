package com.legacyvault.verification.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

/** Cổng pháp lý trung tâm. Không thay thế việc phân quyền hay các điều kiện nghiệp vụ ở bước sau. */
@Component
public class LegalWorkflowGuard {
    /**
     * Các bước cần phê duyệt pháp lý còn hiệu lực: phê duyệt cuối, mở khóa Vault, bàn giao.
     */
    public enum ProtectedTransition { APPROVAL, UNLOCK, HANDOVER }
    private final LegalBasisCaseAccess access;
    private final CourtRouteGuard court;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalApprovalGuard approvals;
    public LegalWorkflowGuard(LegalBasisCaseAccess access, CourtRouteGuard court,
            LegalBasisDossierVersionRepository versions, LegalApprovalGuard approvals) {
        this.access = access;
        this.court = court;
        this.versions = versions;
        this.approvals = approvals;
    }

    /**
     * Chặn thao tác khi Vault hoặc route của hồ sơ đang ON_HOLD.
     * @throws BusinessException LEGAL_WORKFLOW_ON_HOLD
     */
    public static void requireNotOnHold(Vault vault, LegalBasisDossier dossier) {
        if (Vault.STATUS_ON_HOLD.equals(vault.getStatus()) || LegalBasisDossier.ROUTE_ON_HOLD.equals(dossier.getRoute()))
            throw new BusinessException(ErrorCode.LEGAL_WORKFLOW_ON_HOLD);
    }

    /**
     * Use case được bảo vệ gọi hàm này bên trong transaction đã được ủy quyền của mình và giữ khóa đến khi commit.
     *
     * Cổng pháp lý trung tâm trước các bước bảo vệ (APPROVAL/UNLOCK/HANDOVER).
     * Xử lý: khóa Vault/ca/hồ sơ, ca phải mở và không ON_HOLD, hồ sơ FORWARDED (với UNLOCK còn yêu cầu Vault LEGAL_BASIS_VERIFICATION), phiên bản mới nhất
     * phải được chuyển và đạt requiredVersionNo, căn cứ tòa án hợp lệ, và phê duyệt Legal hiện hành phải khớp snapshot (LegalApprovalGuard).
     * Khóa được giữ đến khi transaction của use case gọi kết thúc.
     * @return trạng thái đã khóa của ca
     * @throws BusinessException BASIS_DOSSIER_INVALID_STATE, LEGAL_WORKFLOW_ON_HOLD, LEGAL_DECISION_STALE, LEGAL_APPROVAL_REQUIRED
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public LegalBasisCaseAccess.LockedCase requireProtectedTransition(UUID caseId, ProtectedTransition transition) {
        if (transition == null) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        var locked = access.lock(caseId);
        locked.requireOpen();
        requireNotOnHold(locked.vault(), locked.dossier());
        var dossier = locked.dossier();
        // Chỉ UNLOCK mới yêu cầu Vault đang ở LEGAL_BASIS_VERIFICATION; HANDOVER xảy ra sau khi Vault đã mở khóa nên không áp dụng điều kiện này, nhưng cả hai đều yêu cầu hồ sơ FORWARDED.
        if ((transition == ProtectedTransition.UNLOCK
                && !Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(locked.vault().getStatus()))
                || !LegalBasisDossier.STATUS_FORWARDED.equals(dossier.getStatus()))
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        int latest = versions.findMaxVersionNo(dossier.getLegalBasisDossierId());
        if (!dossier.isLegalReviewable() || latest < dossier.getRequiredVersionNo())
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        var version = versions.findCourtEvidence(dossier.getLegalBasisDossierId(), latest)
                .orElseThrow(() -> new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE));
        if (!"FORWARDED".equals(version.forwardStatus())) throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        court.requireValidDecision(dossier);
        approvals.requireCurrentApproval(dossier, version);
        return locked;
    }
}
