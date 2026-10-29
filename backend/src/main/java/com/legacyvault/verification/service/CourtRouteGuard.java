package com.legacyvault.verification.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.repository.CourtDecisionRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Route-specific evidence gate for approval/unlock/handover callers; never performs those transitions.
 * COURT needs a VALID court assessment of the current version. A legacy NOTARIAL dossier needs a stored, forwarded
 * deed with notary, number and date, no recorded dispute and a MATCH will comparison (LV-WILL-001).
 */
@Component
public class CourtRouteGuard {
    private final CourtDecisionRepository decisions;
    private final LegalBasisDossierVersionRepository versions;
    private final WillComparisonService wills;
    public CourtRouteGuard(CourtDecisionRepository decisions, LegalBasisDossierVersionRepository versions,
            WillComparisonService wills) {
        this.decisions = decisions;
        this.versions = versions;
        this.wills = wills;
    }

    /** Caller holds Vault -> case -> dossier locks for its entire protected transaction. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void requireValidDecision(LegalBasisDossier dossier) {
        ErrorCode blocker = blocker(dossier);
        if (blocker != null) throw new BusinessException(blocker);
    }

    /** Side-effect-free inspection for context reads; does not mark a transaction rollback-only. */
    public ErrorCode blocker(LegalBasisDossier dossier) {
        if (LegalBasisDossier.ROUTE_NOTARIAL.equals(dossier.getRoute())) return notarialBlocker(dossier);
        if (!LegalBasisDossier.ROUTE_COURT.equals(dossier.getRoute())) return ErrorCode.COURT_DECISION_REQUIRED;
        int current = versions.findMaxVersionNo(dossier.getLegalBasisDossierId());
        var evidence = versions.findCourtEvidence(dossier.getLegalBasisDossierId(), current)
                .orElse(null);
        if (evidence == null || current < dossier.getRequiredVersionNo() || !evidence.isReviewable()) return ErrorCode.COURT_DECISION_REQUIRED;
        var decision = decisions.findFirstByDossierVersionIdOrderByIdDesc(evidence.id())
                .orElse(null);
        return decision != null && "VALID".equals(decision.getResult()) ? null : ErrorCode.COURT_DECISION_REQUIRED;
    }

    private ErrorCode notarialBlocker(LegalBasisDossier dossier) {
        if (!LegalBasisDossier.DISPUTE_NONE.equals(dossier.getDisputeStatus())) return ErrorCode.BASIS_DOSSIER_INVALID_STATE;
        int current = versions.findMaxVersionNo(dossier.getLegalBasisDossierId());
        var evidence = versions.findCourtEvidence(dossier.getLegalBasisDossierId(), current).orElse(null);
        if (evidence == null || current < dossier.getRequiredVersionNo() || !evidence.isNotarialReviewable()) {
            return ErrorCode.BASIS_DOSSIER_INVALID_STATE;
        }
        return wills.isApprovalBlocked(dossier.getVerificationCaseId()) ? ErrorCode.WILL_NOT_VERIFIED : null;
    }

}
