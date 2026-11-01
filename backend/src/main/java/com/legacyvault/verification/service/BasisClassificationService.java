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
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalCaseLookupRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/** PS-102: COURT-only writes; optional will comparison never substitutes court validation.
 * Legacy NOTARIAL records remain readable without automatic conversion. Lock Vault -> Case -> Dossier. */
@Service
public class BasisClassificationService {

    static final String ENTITY_TYPE = "LEGAL_BASIS_DOSSIER";
    static final String STEP_ID = "ST-16";
    static final String RULE_ID = "LV-BASIS-001";

    private final LegalCaseLookupRepository caseLookup;
    private final VerificationCaseRepository caseRepository;
    private final VaultRepository vaultRepository;
    private final LegalBasisDossierRepository dossiers;
    private final WillComparisonService willComparisons;
    private final BasisDossierViewService views;
    private final AuditService auditService;
    private final LegalBasisLockedState lockedState;

    public BasisClassificationService(LegalCaseLookupRepository caseLookup, VerificationCaseRepository caseRepository,
            VaultRepository vaultRepository, LegalBasisDossierRepository dossiers, WillComparisonService willComparisons,
            BasisDossierViewService views, AuditService auditService, LegalBasisLockedState lockedState) {
        this.caseLookup = caseLookup;
        this.caseRepository = caseRepository;
        this.vaultRepository = vaultRepository;
        this.dossiers = dossiers;
        this.willComparisons = willComparisons;
        this.views = views;
        this.auditService = auditService;
        this.lockedState = lockedState;
    }

    @Transactional
    public BasisDossierResponse classify(UUID caseId, CustomUserPrincipal principal, ClassifyBasisRequest request) {
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

        if (!Objects.equals(verificationCase.getVaultId(), vault.getVaultId()) || !verificationCase.isOpen()
                || !(Vault.STATUS_WILL_VERIFICATION.equals(vault.getStatus())
                || Vault.STATUS_DOCUMENT_VERIFICATION.equals(vault.getStatus()))) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }
        if (dossiers.findByVerificationCaseId(verificationCase.getVerificationCaseId()).isPresent()) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_ALREADY_EXISTS);
        }
        // COURT evidence, not a will MATCH, controls distribution (PS-102).

        String route = request.route().name();
        boolean onHold = request.route() == ClassifyBasisRequest.Route.ON_HOLD;
        LegalBasisDossier dossier = dossiers.saveAndFlush(new LegalBasisDossier(
                verificationCase.getVerificationCaseId(), route, reason, disputeStatusOf(request.route()),
                legalUserId));

        String vaultStatusBefore = vault.getStatus();
        vault.markLegalBasisRouted(onHold);

        // Audit không ghi lý do phân loại (có thể chứa thông tin tranh chấp); trạng thái Vault đi qua states.
        auditService.record(new AuditEvent(
                AuditAction.LEGAL_BASIS_CLASSIFIED,
                AuditActorType.USER,
                legalUserId,
                vault.getVaultId(),
                ENTITY_TYPE,
                dossier.getLegalBasisDossierId(),
                vaultStatusBefore,
                vault.getStatus(),
                null,
                Map.of(
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

    static String disputeStatusOf(ClassifyBasisRequest.Route route) {
        return switch (route) {
            case NOTARIAL -> LegalBasisDossier.DISPUTE_NONE;
            case COURT -> LegalBasisDossier.DISPUTE_DISPUTED;
            case ON_HOLD -> LegalBasisDossier.DISPUTE_UNDETERMINED;
        };
    }

    private static String validate(ClassifyBasisRequest request) {
        if (request == null || request.route() == null || request.routeReason() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        String reason = request.routeReason().trim();
        if (reason.isEmpty() || reason.length() > 1000) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        return reason;
    }
}
