package com.legacyvault.verification.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.repository.CourtDecisionRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Branch-specific file clearance for approval/unlock/handover; never performs those transitions. */
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
        if (blocker(dossier) != null) throw blocked();
    }

    /** Side-effect-free inspection for context reads; does not mark a transaction rollback-only. */
    public ErrorCode blocker(LegalBasisDossier dossier) {
        if (!java.util.Set.of("COURT", "NOTARIAL").contains(dossier.getRoute())) return ErrorCode.COURT_DECISION_REQUIRED;
        int current = versions.findMaxVersionNo(dossier.getLegalBasisDossierId());
        var evidence = versions.findCourtEvidence(dossier.getLegalBasisDossierId(), current)
                .orElse(null);
        if (LegalBasisDossier.ROUTE_NOTARIAL.equals(dossier.getRoute()))
            return LegalBasisDossier.DISPUTE_NONE.equals(dossier.getDisputeStatus()) && evidence != null && current >= dossier.getRequiredVersionNo() && evidence.isNotarialReviewable()
                ? null : ErrorCode.BASIS_DOSSIER_INVALID_STATE;
        if (evidence == null || current < dossier.getRequiredVersionNo() || !evidence.isReviewable()) return ErrorCode.COURT_DECISION_REQUIRED;
        var decision = decisions.findFirstByDossierVersionIdOrderByIdDesc(evidence.id())
                .orElse(null);
        return decision != null && "VALID".equals(decision.getResult()) ? null : ErrorCode.COURT_DECISION_REQUIRED;
    }

    private static BusinessException blocked() { return new BusinessException(ErrorCode.COURT_DECISION_REQUIRED); }
}
