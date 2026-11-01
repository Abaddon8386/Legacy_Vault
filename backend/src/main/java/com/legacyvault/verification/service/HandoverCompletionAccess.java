package com.legacyvault.verification.service;
import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.repository.*;
import com.legacyvault.verification.entity.*;
import com.legacyvault.vault.entity.Vault;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import java.util.*;
/** One authoritative snapshot, locked Vault -> case -> dossier -> session until commit. */
@Component
@Transactional(propagation=Propagation.MANDATORY)
public class HandoverCompletionAccess {
    private final VerificationCaseRepository cases;
    private final LegalWorkflowGuard workflow;
    private final HandoverSessionRepository sessions;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalBasisVersionAllocationRepository allocations;
    private final HandoverItemRepository items;
    private final LegalBasisLockedState state;
    private final LegalBasisCaseAccess caseAccess;
    private final HandoverCompletionEvidenceRepository evidence;
    public HandoverCompletionAccess(VerificationCaseRepository cases,LegalWorkflowGuard workflow,
            HandoverSessionRepository sessions,LegalBasisDossierVersionRepository versions,
            LegalBasisVersionAllocationRepository allocations,HandoverItemRepository items,LegalBasisLockedState state,
            LegalBasisCaseAccess caseAccess,HandoverCompletionEvidenceRepository evidence) {
        this.cases=cases;this.workflow=workflow;this.sessions=sessions;this.versions=versions;
        this.allocations=allocations;this.items=items;this.state=state;this.caseAccess=caseAccess;this.evidence=evidence;
    }
    /** History reads retain assignment and session ownership without reopening mutation gates. */
    public Snapshot read(UUID caseId,UUID sessionId,CustomUserPrincipal principal) {
        Long staffId=CustomUserPrincipal.requireUserId(principal);
        var initial=cases.findByPublicIdAndAssignedStaffUserId(caseId,staffId)
                .orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        var locked=caseAccess.lock(caseId);
        if(!staffId.equals(locked.verificationCase().getAssignedStaffUserId())
                || !initial.getVerificationCaseId().equals(locked.verificationCase().getVerificationCaseId()))
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        if(locked.verificationCase().isOpen()) return lock(caseId,sessionId,principal,true);
        if(!VerificationCase.STATUS_CLOSED.equals(locked.verificationCase().getStatus())
                || !Vault.STATUS_ARCHIVED.equals(locked.vault().getStatus()))
            throw new BusinessException(ErrorCode.HANDOVER_SESSION_INVALID_STATE);
        var session=sessions.findByPublicIdAndCaseAndStaffForUpdate(sessionId,initial.getVerificationCaseId(),staffId)
                .orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        state.refresh(session);
        if(session.getStatus()!=HandoverSessionStatus.COMPLETED
                || !Objects.equals(locked.verificationCase().getClosedHandoverSessionId(),session.getId()))
            throw new BusinessException(ErrorCode.HANDOVER_SESSION_INVALID_STATE);
        var proof=evidence.findBySessionId(session.getId())
                .orElseThrow(()->new BusinessException(ErrorCode.HANDOVER_SESSION_INVALID_STATE));
        var snapshot=snapshot(locked,session);
        if(!Objects.equals(proof.getVersionId(),snapshot.version().id())
                || !Objects.equals(proof.getSha256(),snapshot.version().sha256())
                || !Objects.equals(proof.getScopeHash(),snapshot.scopeHash()))
            throw new BusinessException(ErrorCode.LEGAL_DECISION_STALE);
        return snapshot;
    }
    public Snapshot lock(UUID caseId,UUID sessionId,CustomUserPrincipal principal,boolean allowCompleted) {
        Long staffId=CustomUserPrincipal.requireUserId(principal);
        var initial=cases.findByPublicIdAndAssignedStaffUserId(caseId,staffId)
                .orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        var locked=workflow.requireProtectedTransition(caseId,LegalWorkflowGuard.ProtectedTransition.HANDOVER);
        if(!initial.getVerificationCaseId().equals(locked.verificationCase().getVerificationCaseId())
                || !staffId.equals(locked.verificationCase().getAssignedStaffUserId()))
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        if(!Vault.STATUS_UNLOCKED.equals(locked.vault().getStatus())
                && !Vault.STATUS_HANDOVER_IN_PROGRESS.equals(locked.vault().getStatus()))
            throw new BusinessException(ErrorCode.HANDOVER_VAULT_NOT_UNLOCKED);
        var session=sessions.findByPublicIdAndCaseAndStaffForUpdate(sessionId,initial.getVerificationCaseId(),staffId)
                .orElseThrow(()->new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        state.refresh(session);
        if(session.getStatus()!=HandoverSessionStatus.OPEN
                && !(allowCompleted && session.getStatus()==HandoverSessionStatus.COMPLETED))
            throw new BusinessException(ErrorCode.HANDOVER_SESSION_INVALID_STATE);
        return snapshot(locked,session);
    }
    public Snapshot snapshot(LegalBasisCaseAccess.LockedCase locked,HandoverSession session) {
        Long dossierId=locked.dossier().getLegalBasisDossierId();
        int number=versions.findMaxVersionNo(dossierId);
        var version=versions.findCourtEvidence(dossierId,number)
                .orElseThrow(()->new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE));
        // Do NOT use eligible-assets resolver: it removes unverified recipients and could shrink the denominator.
        var rows=allocations.findReceiptRowsByDossier(dossierId).stream()
                .filter(r->r.versionNo()==number && LegalBasisVersionAllocation.STATUS_APPROVED.equals(r.status())).toList();
        var ids=rows.stream().map(ReceiptAllocationRow::allocationId).toList();
        Set<Long> delivered=ids.isEmpty()?Set.of():Set.copyOf(items.findDeliveredAllocationIds(ids));
        return new Snapshot(locked,session,version,locked.dossier().getLastReviewedAllocationHash(),rows,delivered);
    }
    public record Snapshot(LegalBasisCaseAccess.LockedCase locked,HandoverSession session,
            CourtEvidenceVersion version,String scopeHash,List<ReceiptAllocationRow> rows,Set<Long> delivered) {}
}
