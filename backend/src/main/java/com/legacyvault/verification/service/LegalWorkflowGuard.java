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

/**
 * Cổng pháp lý trung tâm cho các bước được bảo vệ: phê duyệt (APPROVAL), mở khóa (UNLOCK) và bàn giao (HANDOVER). Đây
 * không thay thế việc kiểm tra quyền hay các điều kiện nghiệp vụ về sau.
 *
 * <p>Được {@link LegalVaultUnlockService} và {@link HandoverSessionService} (cùng các service bàn giao/phân phối khác)
 * gọi trong transaction đã được ủy quyền; khóa giữ đến khi commit. Phối hợp {@link LegalBasisCaseAccess},
 * {@link CourtRouteGuard} và {@link LegalApprovalGuard}.
 */
@Component
public class LegalWorkflowGuard {
    /**
     * Các bước chuyển trạng thái được bảo vệ: phê duyệt, mở khóa Vault, bàn giao.
     */
    public enum ProtectedTransition { APPROVAL, UNLOCK, HANDOVER }
    private final LegalBasisCaseAccess access;
    private final CourtRouteGuard court;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalApprovalGuard approvals;
    /**
     * @param access khóa Vault/case/dossier
     * @param court guard tuyến tòa án
     * @param versions repository phiên bản hồ sơ căn cứ
     * @param approvals guard phê duyệt hiện hành
     */
    public LegalWorkflowGuard(LegalBasisCaseAccess access, CourtRouteGuard court,
            LegalBasisDossierVersionRepository versions, LegalApprovalGuard approvals) {
        this.access = access;
        this.court = court;
        this.versions = versions;
        this.approvals = approvals;
    }

    /**
     * Yêu cầu Vault và dossier không bị tạm dừng (hold).
     *
     * @param vault Vault đã khóa
     * @param dossier hồ sơ căn cứ
     * @throws BusinessException {@code LEGAL_WORKFLOW_ON_HOLD} khi Vault ON_HOLD hoặc dossier ở tuyến ON_HOLD
     */
    public static void requireNotOnHold(Vault vault, LegalBasisDossier dossier) {
        if (Vault.STATUS_ON_HOLD.equals(vault.getStatus()) || LegalBasisDossier.ROUTE_ON_HOLD.equals(dossier.getRoute()))
            throw new BusinessException(ErrorCode.LEGAL_WORKFLOW_ON_HOLD);
    }

    /**
     * Kiểm tra mọi điều kiện pháp lý của bước được bảo vệ và trả về ngữ cảnh đã khóa. Use case phải gọi trong transaction
     * đã được ủy quyền ({@code Propagation.MANDATORY}) và giữ khóa đến khi commit.
     *
     * <p>Các bước: khóa Vault/case/dossier và yêu cầu case mở; không hold; dossier phải FORWARDED (và riêng UNLOCK thì Vault
     * phải ở LEGAL_BASIS_VERIFICATION); dossier có thể xem xét và phiên bản mới nhất không thấp hơn phiên bản yêu cầu; phiên
     * bản mới nhất đã FORWARDED; quyết định tòa án hợp lệ; phê duyệt Legal còn hiện hành.
     *
     * @param caseId public id của hồ sơ xác minh
     * @param transition bước cần bảo vệ
     * @return {@link LegalBasisCaseAccess.LockedCase} đã khóa
     * @throws BusinessException {@code VALIDATION_FAILED}, {@code LEGAL_WORKFLOW_ON_HOLD},
     *         {@code BASIS_DOSSIER_INVALID_STATE}, cùng các lỗi tòa án/phê duyệt từ guard liên quan
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public LegalBasisCaseAccess.LockedCase requireProtectedTransition(UUID caseId, ProtectedTransition transition) {
        if (transition == null) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        var locked = access.lock(caseId);
        locked.requireOpen();
        requireNotOnHold(locked.vault(), locked.dossier());
        var dossier = locked.dossier();
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
