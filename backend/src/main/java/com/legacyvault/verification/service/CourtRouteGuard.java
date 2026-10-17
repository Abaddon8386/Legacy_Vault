package com.legacyvault.verification.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.repository.CourtDecisionRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** A partial legal gate for future approval/unlock/handover callers; never performs those transitions. */
@Component
public class CourtRouteGuard {
    private final CourtDecisionRepository decisions;
    private final LegalBasisDossierVersionRepository versions;
    public CourtRouteGuard(CourtDecisionRepository decisions, LegalBasisDossierVersionRepository versions) {
        this.decisions = decisions;
        this.versions = versions;
    }

    /** Caller holds Vault -> case -> dossier locks for its entire protected transaction. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void requireValidDecision(LegalBasisDossier dossier) {
        if (!LegalBasisDossier.ROUTE_COURT.equals(dossier.getRoute())) return;
        int current = versions.findMaxVersionNo(dossier.getLegalBasisDossierId());
        var evidence = versions.findCourtEvidence(dossier.getLegalBasisDossierId(), current)
                .orElseThrow(CourtRouteGuard::blocked);
        if (!LegalBasisDossier.STATUS_FORWARDED.equals(dossier.getStatus())
                || !evidence.isReviewable()) throw blocked();
        var decision = decisions.findFirstByDossierVersionIdOrderByIdDesc(evidence.id())
                .orElseThrow(CourtRouteGuard::blocked);
        if (!"VALID".equals(decision.getResult())) throw blocked();
    }

    private static BusinessException blocked() { return new BusinessException(ErrorCode.COURT_DECISION_REQUIRED); }
}
