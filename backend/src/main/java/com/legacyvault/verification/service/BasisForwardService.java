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
 * Nghiệp vụ ST-19: Staff chuyển (forward) phiên bản hồ sơ căn cứ mới nhất cho Legal xem xét.
 * Sau khi chuyển, Vault sang trạng thái xác minh căn cứ pháp lý và snapshot được đánh giá lại (LegalBasisReviewService).
 */
@Service
public class BasisForwardService {
    private final com.legacyvault.notification.WorkflowNotificationService notifications;

    static final String ENTITY_TYPE = "LEGAL_BASIS_DOSSIER";
    static final String STEP_ID = "ST-19";
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
     * ST-19: chuyển phiên bản dossier mới nhất cho Legal.
     *
     * Thứ tự khóa chuẩn: Vault -> VerificationCase -> Dossier.
     *
     * Xử lý: kiểm tra ca thuộc Staff, ca đang mở, Vault ở trạng thái tiếp nhận căn cứ, hồ sơ PROVIDED và không ON_HOLD;
     * chỉ chuyển đúng phiên bản mới nhất và không thấp hơn requiredVersionNo; đánh dấu FORWARDED bằng UPDATE có điều kiện,
     * ghi audit, đánh giá lại snapshot review và tạo thông báo cho Legal.
     *
     * @param caseId public UUID của ca
     * @param versionNo số phiên bản cần chuyển
     * @param principal Staff đang đăng nhập
     * @return hồ sơ căn cứ sau khi chuyển
     * @throws BusinessException RESOURCE_NOT_FOUND, BASIS_DOSSIER_INVALID_STATE, BASIS_VERSION_STALE
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

        // Khóa Vault trước tiên (đầu chuỗi Vault -> ca -> hồ sơ) để tuần tự hóa với mọi thao tác khác trên cùng Vault.
        Vault vault = vaultRepository.findByIdForUpdate(initialCase.getVaultId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(vault);

        VerificationCase verificationCase = caseRepository.findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(verificationCase);

        // Kiểm tra lại sau khi khóa: ca có thể đã đổi người phụ trách giữa lần đọc không khóa và lần khóa; trả NOT_FOUND để không lộ sự tồn tại của ca.
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

        // Chỉ phiên bản mới nhất, và phải đạt mức yêu cầu (requiredVersionNo), mới được chuyển; phiên bản cũ là BASIS_VERSION_STALE.
        if (versionNo != latestVersionNo || versionNo < dossier.getRequiredVersionNo()) {
            throw new BusinessException(ErrorCode.BASIS_VERSION_STALE);
        }

        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);

        // UPDATE có điều kiện (chỉ khi NOT_FORWARDED): nếu bản ghi vừa bị chuyển bởi luồng khác thì trả khác 1 và bị từ chối.
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

        // Thông báo cho workspace Legal; khóa idempotency "forward:<dossier>:<version>" tránh tạo thông báo trùng khi gọi lại.
        var notification = notifications.record(verificationCase, com.legacyvault.notification.WorkflowNotificationService.Workspace.LEGAL, "LEGAL_BASIS_FORWARDED", "forward:" + dossier.getPublicId() + ":" + versionNo, null);
        return views.view(verificationCase, false).withNotification(notification);
    }
}