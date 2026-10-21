package com.legacyvault.verification.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

/** Central legal gate. This is not a substitute for authorization or later business prerequisites. */
@Component
public class LegalWorkflowGuard {
    public enum ProtectedTransition { APPROVAL, UNLOCK, HANDOVER }
    private final LegalBasisCaseAccess access;
    private final CourtRouteGuard court;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalApprovalGuard approvals;
    public LegalWorkflowGuard(LegalBasisCaseAccess access, CourtRouteGuard court,
            LegalBasisDossierVersionRepository versions, LegalApprovalGuard approvals) {
        this.access = access;
        this.court = court;
        this.versions = versions;
        this.approvals = approvals;
    }

    public static void requireNotOnHold(Vault vault, LegalBasisDossier dossier) {
        if (Vault.STATUS_ON_HOLD.equals(vault.getStatus()) || LegalBasisDossier.ROUTE_ON_HOLD.equals(dossier.getRoute()))
            throw new BusinessException(ErrorCode.LEGAL_WORKFLOW_ON_HOLD);
    }

    /** Protected use cases invoke this inside their authorized transaction and retain locks until commit. */
    @Transactional(propagation = Propagation.MANDATORY)
    public LegalBasisCaseAccess.LockedCase requireProtectedTransition(UUID caseId, ProtectedTransition transition) {
        if (transition == null) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        var locked = access.lock(caseId);
        locked.requireOpen();
        requireNotOnHold(locked.vault(), locked.dossier());
        var dossier = locked.dossier();
        if (!dossier.acceptsIntake()) throw new BusinessException(ErrorCode.COURT_DECISION_REQUIRED);
        if ((transition == ProtectedTransition.UNLOCK
                && !Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(locked.vault().getStatus()))
                || !LegalBasisDossier.STATUS_FORWARDED.equals(dossier.getStatus()))
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        int latest = versions.findMaxVersionNo(dossier.getLegalBasisDossierId());
        if (!dossier.acceptsIntake() || latest < dossier.getRequiredVersionNo())
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        var version = versions.findCourtEvidence(dossier.getLegalBasisDossierId(), latest)
                .orElseThrow(() -> new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE));
        if (!"FORWARDED".equals(version.forwardStatus())) throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        court.requireValidDecision(dossier);
        approvals.requireCurrentApproval(dossier, version);
        return locked;
    }
}
