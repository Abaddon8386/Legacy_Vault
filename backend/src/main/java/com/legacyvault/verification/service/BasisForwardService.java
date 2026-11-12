package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.BasisDossierResponse;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * ST-19 (LV-BASIS-001, PS-37): Staff chuyển tiếp (forward) phiên bản mới nhất của hồ sơ căn cứ sang cho Legal.
 *
 * Được gọi qua {@link DistributionWorkflowService#forward}, mà controller
 * {@code StaffBasisIntakeController} phơi ra tại
 * {@code POST /api/v1/staff/verification-cases/{caseId}/basis-dossier/versions/{version}/forward} (vai trò {@code STAFF_EXECUTOR}).
 * Ghi bảng {@code legal_basis_dossier_versions} (đánh dấu FORWARDED), {@code legal_basis_dossiers}, trạng thái Vault,
 * audit {@code LEGAL_BASIS_FORWARDED} và gửi thông báo cho workspace Legal.
 */
@Service
public class BasisForwardService {
    /**
     * Dịch vụ ghi thông báo workflow gửi sang Legal.
     */
    private final com.legacyvault.notification.WorkflowNotificationService notifications;

    /**
     * Loại thực thể ghi vào audit log.
     */
    static final String ENTITY_TYPE = "LEGAL_BASIS_DOSSIER";
    /**
     * Mã bước quy trình ghi vào audit (ST-19: chuyển tiếp hồ sơ căn cứ).
     */
    static final String STEP_ID = "ST-19";
    /**
     * Mã quy tắc nghiệp vụ ghi vào audit.
     */
    static final String RULE_ID = "LV-BASIS-001";

    private final StaffCaseLockRepository staffCases;
    private final VerificationCaseRepository caseRepository;
    private final VaultRepository vaultRepository;
    private final LegalBasisDossierRepository dossiers;
    private final LegalBasisDossierVersionRepository versions;
    private final BasisDossierViewService views;
    private final AuditService auditService;
    private final LegalBasisLockedState lockedState;
    private final LegalBasisReviewService reviewService;

    /**
     * Khởi tạo service với repository ca/Vault/hồ sơ/phiên bản và các thành phần phụ trợ (audit, view, trạng thái đã khóa,
     * dịch vụ rà soát PS-37, thông báo).
     */
    public BasisForwardService(
            StaffCaseLockRepository staffCases,
            VerificationCaseRepository caseRepository,
            VaultRepository vaultRepository,
            LegalBasisDossierRepository dossiers,
            LegalBasisDossierVersionRepository versions,
            BasisDossierViewService views,
            AuditService auditService,
            LegalBasisLockedState lockedState,
            LegalBasisReviewService reviewService
    , com.legacyvault.notification.WorkflowNotificationService notifications) {
        this.notifications = notifications;
        this.staffCases = staffCases;
        this.caseRepository = caseRepository;
        this.vaultRepository = vaultRepository;
        this.dossiers = dossiers;
        this.versions = versions;
        this.views = views;
        this.auditService = auditService;
        this.lockedState = lockedState;
        this.reviewService = reviewService;
    }

    /**
     * ST-19: chuyển tiếp phiên bản dossier mới nhất cho Legal. Thứ tự khóa chuẩn: Vault -> VerificationCase -> Dossier.
     *
     * Các bước: (1) tìm ca thuộc Staff (không khóa) để biết Vault; (2) khóa Vault → VerificationCase → Dossier và làm mới
     * trạng thái; (3) kiểm tra quyền sở hữu, ca còn mở, Vault ở trạng thái tiếp nhận căn cứ, không bị ON_HOLD, hồ sơ đang
     * PROVIDED; (4) chỉ cho phép chuyển đúng phiên bản mới nhất và không thấp hơn phiên bản yêu cầu; (5) {@code markForwarded}
     * phiên bản, đánh dấu dossier FORWARDED, chuyển Vault sang xác minh pháp lý; (6) ghi audit {@code LEGAL_BASIS_FORWARDED};
     * (7) đánh giá lại snapshot PS-37 ({@code evaluateAfterChange}) trong cùng transaction; (8) gửi thông báo cho Legal.
     *
     * @param caseId UUID công khai của ca xác minh
     * @param versionNo số phiên bản cần chuyển tiếp
     * @param principal Staff đang đăng nhập (phải là người nhận ca)
     * @return hồ sơ căn cứ sau khi chuyển (kèm thông báo), không kèm lý do phân loại
     * @throws com.legacyvault.common.error.BusinessException RESOURCE_NOT_FOUND (ca không thuộc Staff hoặc phiên bản không tồn tại),
     *         LEGAL_WORKFLOW_ON_HOLD, BASIS_DOSSIER_INVALID_STATE, BASIS_VERSION_STALE (không phải phiên bản mới nhất hoặc thấp hơn phiên bản yêu cầu)
     */
    @Transactional
    public BasisDossierResponse forward(
            UUID caseId,
            int versionNo,
            CustomUserPrincipal principal
    ) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);

        // Đọc không khóa để biết Vault cần khóa trước; sau đó khóa Vault -> ca -> hồ sơ.
        VerificationCase initialCase = staffCases.findOwnedByStaff(caseId, staffUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        Vault vault = vaultRepository.findByIdForUpdate(initialCase.getVaultId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(vault);

        VerificationCase verificationCase = caseRepository.findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(verificationCase);

        if (!Objects.equals(verificationCase.getAssignedStaffUserId(), staffUserId)
                || !Objects.equals(verificationCase.getVaultId(), vault.getVaultId())
                || !Objects.equals(verificationCase.getPublicId(), caseId)) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }

        if (!verificationCase.isOpen() || !vault.isLegalBasisIntakeState()) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        LegalBasisDossier dossier = dossiers.findByVerificationCaseIdForUpdate(verificationCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(dossier);
        LegalWorkflowGuard.requireNotOnHold(vault, dossier);

        if (!dossier.acceptsIntake() || !LegalBasisDossier.STATUS_PROVIDED.equals(dossier.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        int latestVersionNo = versions.findMaxVersionNo(dossier.getLegalBasisDossierId());

        if (versionNo < 1 || versionNo > latestVersionNo) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }

        if (versionNo != latestVersionNo || versionNo < dossier.getRequiredVersionNo()) {
            throw new BusinessException(ErrorCode.BASIS_VERSION_STALE);
        }

        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);

        if (versions.markForwarded(
                dossier.getLegalBasisDossierId(),
                versionNo,
                staffUserId,
                now) != 1) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        String vaultStatusBefore = vault.getStatus();

        dossier.markForwarded();
        vault.markLegalBasisVerification();

        auditService.record(new AuditEvent(
                AuditAction.LEGAL_BASIS_FORWARDED,
                AuditActorType.USER,
                staffUserId,
                vault.getVaultId(),
                ENTITY_TYPE,
                dossier.getLegalBasisDossierId(),
                vaultStatusBefore,
                vault.getStatus(),
                null,
                Map.of(
                        "dossierId", dossier.getPublicId().toString(),
                        "verificationCaseId", verificationCase.getPublicId().toString(),
                        "version", versionNo,
                        "route", dossier.getRoute()),
                STEP_ID,
                RULE_ID));

        /*
         * PS-37: đánh giá snapshot sau khi forward.
         * REVIEW_REQUIRED là kết quả nghiệp vụ hợp lệ, không phải exception.
         */
        reviewService.evaluateAfterChange(verificationCase.getPublicId());

        var notification = notifications.record(verificationCase, com.legacyvault.notification.WorkflowNotificationService.Workspace.LEGAL, "LEGAL_BASIS_FORWARDED", "forward:" + dossier.getPublicId() + ":" + versionNo, null);
        return views.view(verificationCase, false).withNotification(notification);
    }
}