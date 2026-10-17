package com.legacyvault.verification.service;

import com.legacyvault.audit.*;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.verification.dto.CourtDecisionRequest;
import com.legacyvault.verification.dto.CourtDecisionResponse;
import com.legacyvault.verification.entity.CourtDecision;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class CourtDecisionService {
    private final LegalBasisCaseAccess access;
    private final LegalCaseLookupRepository cases;
    private final LegalBasisDossierVersionRepository versions;
    private final CourtDecisionRepository decisions;
    private final AuditService audit;

    public CourtDecisionService(LegalBasisCaseAccess access, LegalCaseLookupRepository cases,
            LegalBasisDossierVersionRepository versions, CourtDecisionRepository decisions, AuditService audit) {
        this.access = access;
        this.cases = cases;
        this.versions = versions;
        this.decisions = decisions;
        this.audit = audit;
    }

    @Transactional
    public CourtDecisionResponse record(UUID caseId, CustomUserPrincipal principal, CourtDecisionRequest request) {
        Long actor = CustomUserPrincipal.requireUserId(principal);
        if (request == null || request.version() == null || request.version() < 1 || request.result() == null
                || request.reason() == null || request.reason().isBlank() || request.reason().length() > 1000)
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        var locked = access.lock(caseId);
        locked.requireOpen();
        var dossier = locked.dossier();
        LegalWorkflowGuard.requireNotOnHold(locked.vault(), dossier);
        if (!LegalBasisDossier.ROUTE_COURT.equals(dossier.getRoute())
                || !Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(locked.vault().getStatus())
                || !LegalBasisDossier.STATUS_FORWARDED.equals(dossier.getStatus()))
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        var evidence = versions.findCourtEvidence(dossier.getLegalBasisDossierId(), request.version())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (request.version() < dossier.getRequiredVersionNo() || request.version() != versions.findMaxVersionNo(dossier.getLegalBasisDossierId()))
            throw new BusinessException(ErrorCode.BASIS_VERSION_STALE);
        if (!evidence.isReviewable())
            throw new BusinessException(ErrorCode.COURT_EVIDENCE_REQUIRED);
        CourtDecision decision = decisions.saveAndFlush(new CourtDecision(evidence.id(), request.result().name(), request.reason().trim(), actor));
        audit.record(new AuditEvent(AuditAction.COURT_DECISION_RECORDED, AuditActorType.USER, actor,
                locked.vault().getVaultId(), "COURT_DECISION", decision.getId(), null, null, null,
                Map.of("verificationCaseId", caseId.toString(), "dossierId", dossier.getPublicId().toString(),
                        "version", evidence.version(), "sha256", evidence.sha256(), "result", decision.getResult()),
                "ST-20", "LV-COURT-001"));
        return new CourtDecisionResponse(decision.getPublicId(), caseId, evidence.version(), evidence.sha256(),
                decision.getResult(), decision.getReason(), principal.publicId(), decision.getReviewedAt().toInstant(ZoneOffset.UTC));
    }

    @Transactional(readOnly = true)
    public List<CourtDecisionResponse> history(UUID caseId) {
        var verificationCase = cases.findByPublicId(caseId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        return decisions.findRows(verificationCase.getVerificationCaseId()).stream().map(CourtDecisionRow::response).toList();
    }
}
