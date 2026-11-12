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
import com.legacyvault.verification.dto.ClassifyBasisRequest;
import com.legacyvault.verification.entity.LegalBasisClassificationHistory;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.LegalBasisClassificationHistoryRepository;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalCaseLookupRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * PS-102: COURT-only writes; optional will comparison never substitutes court validation.
 * Legacy NOTARIAL records remain readable without automatic conversion. Lock Vault -> Case -> Dossier.
 *
 * <p>ST-16 (LV-HOLD-001): Legal phân loại lại hồ sơ căn cứ đang tạm giữ (ON_HOLD) sang COURT hoặc NOTARIAL để tiếp tục quy trình.
 *
 * Được gọi bởi {@code LegalBasisDossierController} qua
 * {@code POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/reclassification}
 * (vai trò {@code LEGAL_VERIFIER}), body {@link ClassifyBasisRequest}. Khóa Vault → ca → dossier; lưu lịch sử phân loại cũ vào
 * {@code legal_basis_classification_history}, ghi audit {@code LEGAL_BASIS_RECLASSIFIED} và thông báo cho Staff.
 */
@Service
public class BasisReclassificationService {

    /**
     * Loại thực thể ghi vào audit log.
     */
    static final String ENTITY_TYPE = "LEGAL_BASIS_DOSSIER";
    /**
     * Mã bước quy trình ghi vào audit (ST-16).
     */
    static final String STEP_ID = "ST-16";
    /**
     * Mã quy tắc nghiệp vụ ghi vào audit (LV-HOLD-001: tạm giữ).
     */
    static final String RULE_ID = "LV-HOLD-001";

    private final LegalCaseLookupRepository caseLookup;
    private final VerificationCaseRepository caseRepository;
    private final VaultRepository vaultRepository;
    private final LegalBasisDossierRepository dossiers;
    private final LegalBasisClassificationHistoryRepository history;
    private final WillComparisonService willComparisons;
    private final BasisDossierViewService views;
    private final AuditService auditService;
    private final LegalBasisLockedState lockedState;
    private final com.legacyvault.notification.WorkflowNotificationService notifications;

    /**
     * Khởi tạo service với các repository (ca, Vault, hồ sơ, lịch sử phân loại) và các thành phần phụ trợ (view, audit, thông báo).
     */
    public BasisReclassificationService(LegalCaseLookupRepository caseLookup, VerificationCaseRepository caseRepository,
            VaultRepository vaultRepository, LegalBasisDossierRepository dossiers,
            LegalBasisClassificationHistoryRepository history, WillComparisonService willComparisons,
            BasisDossierViewService views, AuditService auditService, LegalBasisLockedState lockedState,
            com.legacyvault.notification.WorkflowNotificationService notifications) {
        this.caseLookup = caseLookup;
        this.caseRepository = caseRepository;
        this.vaultRepository = vaultRepository;
        this.dossiers = dossiers;
        this.history = history;
        this.willComparisons = willComparisons;
        this.views = views;
        this.auditService = auditService;
        this.lockedState = lockedState;
        this.notifications = notifications;
    }

    /**
     * Phân loại lại hồ sơ đang ON_HOLD.
     *
     * Các bước: kiểm tra request; khóa Vault → ca → dossier; yêu cầu ca mở, Vault ở trạng thái ON_HOLD, dossier nhánh ON_HOLD
     * và đang DRAFT; lưu bản chụp phân loại cũ vào lịch sử; cập nhật dossier sang nhánh mới ({@code dossier.reclassify});
     * chuyển Vault về trạng thái chờ căn cứ pháp lý ({@code markAwaitingLegalBasisAfterHold}); ghi audit; gửi thông báo cho Staff.
     *
     * @param caseId UUID công khai của ca xác minh
     * @param principal Legal đang đăng nhập
     * @param request nhánh mới (không được là ON_HOLD) và lý do (tối đa 1000 ký tự)
     * @return hồ sơ căn cứ sau khi phân loại lại (kèm lý do và thông báo)
     * @throws com.legacyvault.common.error.BusinessException VALIDATION_FAILED, RESOURCE_NOT_FOUND, BASIS_DOSSIER_INVALID_STATE
     */
    @Transactional
    public BasisDossierResponse reclassify(UUID caseId, CustomUserPrincipal principal, ClassifyBasisRequest request) {
        Long legalUserId = CustomUserPrincipal.requireUserId(principal);
        String reason = validate(request);

        VerificationCase initialCase = caseLookup.findByPublicId(caseId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        Vault vault = vaultRepository.findByIdForUpdate(initialCase.getVaultId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(vault);
        VerificationCase verificationCase = caseRepository.findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(verificationCase);
        LegalBasisDossier dossier = dossiers.findByVerificationCaseIdForUpdate(verificationCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(dossier);

        if (!Objects.equals(verificationCase.getVaultId(), vault.getVaultId()) || !verificationCase.isOpen()
                || !Vault.STATUS_ON_HOLD.equals(vault.getStatus())
                || !LegalBasisDossier.ROUTE_ON_HOLD.equals(dossier.getRoute())
                || !LegalBasisDossier.STATUS_DRAFT.equals(dossier.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }
        // COURT evidence, not a will MATCH, controls distribution (PS-102).

        String previousRoute = dossier.getRoute();
        String route = request.route().name();
        var savedClassification = history.saveAndFlush(LegalBasisClassificationHistory.of(dossier));
        dossier.reclassify(route, reason, BasisClassificationService.disputeStatusOf(request.route()), legalUserId);
        dossiers.saveAndFlush(dossier);

        String vaultStatusBefore = vault.getStatus();
        vault.markAwaitingLegalBasisAfterHold();

        // Như ST-16: không ghi lý do vào audit; lý do cũ nằm trong lịch sử phân loại.
        auditService.record(new AuditEvent(
                AuditAction.LEGAL_BASIS_RECLASSIFIED,
                AuditActorType.USER,
                legalUserId,
                vault.getVaultId(),
                ENTITY_TYPE,
                dossier.getLegalBasisDossierId(),
                vaultStatusBefore,
                vault.getStatus(),
                null,
                Map.of(
                        "previousRoute", previousRoute,
                        "route", route,
                        "disputeStatus", dossier.getDisputeStatus(),
                        "verificationCaseId", verificationCase.getPublicId().toString(),
                        "dossierId", dossier.getPublicId().toString()
                ),
                STEP_ID,
                RULE_ID
        ));

        var notification = notifications.record(verificationCase,
                com.legacyvault.notification.WorkflowNotificationService.Workspace.STAFF,
                "LEGAL_BASIS_RECLASSIFIED", "basis-resume:" + savedClassification.getPublicId(), reason);
        return views.view(verificationCase, true).withNotification(notification);
    }

    /**
     * Kiểm tra request: có nhánh (khác ON_HOLD) và lý do không rỗng, tối đa 1000 ký tự.
     *
     * @return lý do đã trim
     * @throws com.legacyvault.common.error.BusinessException VALIDATION_FAILED nếu không hợp lệ
     */
    private static String validate(ClassifyBasisRequest request) {
        if (request == null || request.route() == null || request.routeReason() == null
                || request.route() == ClassifyBasisRequest.Route.ON_HOLD) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        String reason = request.routeReason().trim();
        if (reason.isEmpty() || reason.length() > 1000) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        return reason;
    }
}
