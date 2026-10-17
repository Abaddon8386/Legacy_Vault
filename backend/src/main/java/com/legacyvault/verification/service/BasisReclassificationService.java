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
 * PS-43 (ST-16, LV-HOLD-001): Legal phân loại lại hồ sơ căn cứ đang ON_HOLD (chưa đủ thông tin) sang NOTARIAL hoặc COURT khi đã
 * có đủ chứng cứ. Chỉ ON_HOLD mới được đổi nhánh; NOTARIAL và COURT không đổi lẫn nhau, dù Trustee đổi lời khai (D-LEGAL-002).
 * Phân loại cũ được lưu vào lịch sử, không ghi đè. Vault ON_HOLD -> AWAITING_LEGAL_BASIS (qua LEGAL_BASIS_CLASSIFICATION).
 * Thứ tự khóa Vault -> ca -> hồ sơ.
 */
@Service
public class BasisReclassificationService {

    static final String ENTITY_TYPE = "LEGAL_BASIS_DOSSIER";
    static final String STEP_ID = "ST-16";
    static final String RULE_ID = "LV-HOLD-001";

    private final LegalCaseLookupRepository caseLookup;
    private final VerificationCaseRepository caseRepository;
    private final VaultRepository vaultRepository;
    private final LegalBasisDossierRepository dossiers;
    private final LegalBasisClassificationHistoryRepository history;
    private final WillComparisonService willComparisons;
    private final BasisDossierViewService views;
    private final AuditService auditService;

    public BasisReclassificationService(LegalCaseLookupRepository caseLookup, VerificationCaseRepository caseRepository,
            VaultRepository vaultRepository, LegalBasisDossierRepository dossiers,
            LegalBasisClassificationHistoryRepository history, WillComparisonService willComparisons,
            BasisDossierViewService views, AuditService auditService) {
        this.caseLookup = caseLookup;
        this.caseRepository = caseRepository;
        this.vaultRepository = vaultRepository;
        this.dossiers = dossiers;
        this.history = history;
        this.willComparisons = willComparisons;
        this.views = views;
        this.auditService = auditService;
    }

    @Transactional
    public BasisDossierResponse reclassify(UUID caseId, CustomUserPrincipal principal, ClassifyBasisRequest request) {
        Long legalUserId = CustomUserPrincipal.requireUserId(principal);
        String reason = validate(request);

        VerificationCase initialCase = caseLookup.findByPublicId(caseId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        Vault vault = vaultRepository.findByIdForUpdate(initialCase.getVaultId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        VerificationCase verificationCase = caseRepository.findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        LegalBasisDossier dossier = dossiers.findByVerificationCaseIdForUpdate(verificationCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        if (!Objects.equals(verificationCase.getVaultId(), vault.getVaultId()) || !verificationCase.isOpen()
                || !Vault.STATUS_ON_HOLD.equals(vault.getStatus())
                || !LegalBasisDossier.ROUTE_ON_HOLD.equals(dossier.getRoute())
                || !LegalBasisDossier.STATUS_DRAFT.equals(dossier.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }
        if (willComparisons.isApprovalBlocked(verificationCase.getVerificationCaseId())) {
            throw new BusinessException(ErrorCode.WILL_NOT_VERIFIED);
        }

        String previousRoute = dossier.getRoute();
        String route = request.route().name();
        history.saveAndFlush(LegalBasisClassificationHistory.of(dossier));
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

        return views.view(verificationCase, true);
    }

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
