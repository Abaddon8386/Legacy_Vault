package com.legacyvault.verification.service;

import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.verification.entity.HandoverSession;
import com.legacyvault.verification.entity.HandoverSessionStatus;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.HandoverSessionRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;

/**
 * PS-66 (ST-25, LV-HANDOVER-001): the single gate every handover use case passes before it reads or writes
 * delivery data. It never relies on the Vault status UNLOCKED alone (AC-L07). A call checks, in this order:
 * <ol>
 *   <li>the case belongs to the calling Staff (otherwise 404, nothing is revealed);</li>
 *   <li>{@link LegalWorkflowGuard}: case OPEN, no hold, forwarded dossier at the required version, valid court
 *       decision for the COURT route, and a Legal approval that still matches the current version/hash/scope;</li>
 *   <li>the Vault is UNLOCKED or HANDOVER_IN_PROGRESS;</li>
 *   <li>the handover session of this case and Staff exists and is OPEN.</li>
 * </ol>
 * Locks Vault -> case -> dossier -> session and keeps them until the caller transaction ends.
 */
@Component
public class HandoverAuthorizationGuard {

    private final VerificationCaseRepository cases;
    private final LegalWorkflowGuard workflow;
    private final HandoverSessionRepository sessions;
    private final LegalBasisDossierVersionRepository versions;

    public HandoverAuthorizationGuard(VerificationCaseRepository cases, LegalWorkflowGuard workflow,
            HandoverSessionRepository sessions, LegalBasisDossierVersionRepository versions) {
        this.cases = cases;
        this.workflow = workflow;
        this.sessions = sessions;
        this.versions = versions;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Authorized authorize(UUID casePublicId, UUID sessionPublicId, Long staffUserId) {
        VerificationCase initial = cases.findByPublicIdAndAssignedStaffUserId(casePublicId, staffUserId)
                .orElseThrow(HandoverAuthorizationGuard::notFound);
        var locked = workflow.requireProtectedTransition(casePublicId, LegalWorkflowGuard.ProtectedTransition.HANDOVER);
        VerificationCase verificationCase = locked.verificationCase();
        if (!verificationCase.getVerificationCaseId().equals(initial.getVerificationCaseId())
                || !staffUserId.equals(verificationCase.getAssignedStaffUserId())) {
            throw notFound();
        }
        Vault vault = locked.vault();
        if (!Vault.STATUS_UNLOCKED.equals(vault.getStatus())
                && !Vault.STATUS_HANDOVER_IN_PROGRESS.equals(vault.getStatus())) {
            throw new BusinessException(ErrorCode.HANDOVER_VAULT_NOT_UNLOCKED);
        }
        HandoverSession session = sessions.findByPublicIdAndCaseAndStaffForUpdate(
                        sessionPublicId, verificationCase.getVerificationCaseId(), staffUserId)
                .orElseThrow(HandoverAuthorizationGuard::notFound);
        if (session.getStatus() != HandoverSessionStatus.OPEN) {
            throw new BusinessException(ErrorCode.HANDOVER_SESSION_INVALID_STATE);
        }
        LegalBasisDossier dossier = locked.dossier();
        int versionNo = versions.findMaxVersionNo(dossier.getLegalBasisDossierId());
        return new Authorized(vault, verificationCase, dossier, session, versionNo);
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
    }

    /** Everything locked and verified by {@link #authorize}. {@code versionNo} is the approved current version. */
    public record Authorized(Vault vault, VerificationCase verificationCase, LegalBasisDossier dossier,
            HandoverSession session, int versionNo) {}
}
