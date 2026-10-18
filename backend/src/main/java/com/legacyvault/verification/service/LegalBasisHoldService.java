package com.legacyvault.verification.service;

import com.legacyvault.audit.*;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.verification.dto.*;
import com.legacyvault.verification.entity.*;
import com.legacyvault.verification.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;
import java.util.UUID;

@Service
public class LegalBasisHoldService {
    private final LegalBasisCaseAccess access;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalBasisClassificationHistoryRepository history;
    private final BasisDossierViewService views;
    private final AuditService audit;
    public LegalBasisHoldService(LegalBasisCaseAccess access, LegalBasisDossierVersionRepository versions,
            LegalBasisClassificationHistoryRepository history, BasisDossierViewService views, AuditService audit) {
        this.access = access;
        this.versions = versions;
        this.history = history;
        this.views = views;
        this.audit = audit;
    }

    @Transactional
    public BasisDossierResponse hold(UUID caseId, CustomUserPrincipal principal, HoldBasisRequest request) {
        Long actor = CustomUserPrincipal.requireUserId(principal);
        if (request == null || request.cause() == null || request.reason() == null || request.reason().isBlank()
                || request.reason().length() > 1000) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        var locked = access.lock(caseId);
        locked.requireOpen();
        var dossier = locked.dossier();
        var vault = locked.vault();
        if (!dossier.acceptsIntake() || !(Vault.STATUS_AWAITING_LEGAL_BASIS.equals(vault.getStatus())
                || Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(vault.getStatus())))
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        int nextVersion = versions.findMaxVersionNo(dossier.getLegalBasisDossierId()) + 1;
        String before = vault.getStatus();
        String previousRoute = dossier.getRoute();
        history.saveAndFlush(LegalBasisClassificationHistory.of(dossier));
        dossier.placeOnHold(request.reason().trim(), request.cause() == HoldBasisRequest.Cause.NEW_DISPUTE
                ? LegalBasisDossier.DISPUTE_DISPUTED : LegalBasisDossier.DISPUTE_UNDETERMINED, actor, nextVersion);
        vault.holdLegalBasisReview();
        audit.record(new AuditEvent(AuditAction.LEGAL_BASIS_HELD, AuditActorType.USER, actor, vault.getVaultId(),
                "LEGAL_BASIS_DOSSIER", dossier.getLegalBasisDossierId(), before, vault.getStatus(), null,
                Map.of("verificationCaseId", caseId.toString(), "dossierId", dossier.getPublicId().toString(),
                        "previousRoute", previousRoute, "route", "ON_HOLD", "cause", request.cause().name(),
                        "requiredVersion", dossier.getRequiredVersionNo()), "ST-16", "LV-HOLD-001"));
        return views.view(locked.verificationCase(), true);
    }
}
