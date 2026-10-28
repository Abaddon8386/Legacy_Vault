package com.legacyvault.verification.service;

import com.legacyvault.common.error.*;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.verification.dto.LegalReadDtos.*;
import com.legacyvault.verification.entity.*;
import com.legacyvault.verification.repository.*;
import com.legacyvault.vault.entity.Vault;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service
public class LegalReadService {
    private final LegalQueueRepository queue;
    private final LegalBasisCaseAccess access;
    private final BasisDossierViewService dossiers;
    private final WillComparisonService wills;
    private final DeathDocumentRecordRepository deaths;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalBasisVersionAllocationRepository allocations;
    private final LegalBasisReviewHistoryRepository history;
    private final CourtDecisionRepository courtDecisions;
    private final LegalApprovalGuard approvals;
    private final CourtRouteGuard court;
    private final UserRepository users;
    public LegalReadService(LegalQueueRepository queue,LegalBasisCaseAccess access,BasisDossierViewService dossiers,
        WillComparisonService wills,DeathDocumentRecordRepository deaths,LegalBasisDossierVersionRepository versions,
        LegalBasisVersionAllocationRepository allocations,LegalBasisReviewHistoryRepository history,
        CourtDecisionRepository courtDecisions,LegalApprovalGuard approvals,CourtRouteGuard court,UserRepository users) {
        this.queue=queue;this.access=access;this.dossiers=dossiers;this.wills=wills;this.deaths=deaths;this.versions=versions;
        this.allocations=allocations;this.history=history;this.courtDecisions=courtDecisions;this.approvals=approvals;this.court=court;this.users=users;
    }
    @Transactional(readOnly=true)
    public PageResponse<QueueItem> queue(CustomUserPrincipal principal,String status,String route,int page,int size) {
        CustomUserPrincipal.requireUserId(principal);
        if(page<0 || size<1 || size>100 || (status!=null && !Set.of("OPEN","CLOSED","CANCELLED").contains(status))
            || (route!=null && !Set.of("NOTARIAL","COURT","ON_HOLD").contains(route))) throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        return queue.page(status,route,page,size);
    }
    /** Locking read, no mutations. Never catch throwing transactional write guards to compute capabilities. */
    @Transactional(timeout=20)
    public Context context(CustomUserPrincipal principal,UUID caseId) {
        CustomUserPrincipal.requireUserId(principal);
        var locked=access.lockContext(caseId);
        var c=locked.verificationCase();var v=locked.vault();var d=locked.dossier();
        var references=deaths.findByVerificationCaseIdOrderByReceivedAtDescDeathDocumentRecordIdDesc(c.getVerificationCaseId()).stream()
            .map(x->new DeathReference(x.getPublicId(),x.getDocumentType(),x.getReceivedAt().toInstant(ZoneOffset.UTC))).toList();
        var will=wills.overview(caseId);
        Snapshot snapshot=null;
        ErrorCode approvalReason=ErrorCode.BASIS_DOSSIER_INVALID_STATE,unlockReason=approvalReason;
        if(d!=null) {
            int latest=versions.findMaxVersionNo(d.getLegalBasisDossierId());
            var version=latest==0?null:versions.findCourtEvidence(d.getLegalBasisDossierId(),latest).orElse(null);
            String hash=AllocationScopeHash.hashApprovalRows(allocations.findRowsByDossier(d.getLegalBasisDossierId()).stream().filter(x->x.versionNo()==latest).toList());
            boolean fresh=version!=null && approvals.reviewBlocker(d,version)==null;
            boolean current=version!=null && approvals.currentApprovalBlocker(d,version)==null;
            var decision=history.findFirstByDossierIdAndReviewStatusInOrderByIdDesc(d.getLegalBasisDossierId(),List.of("LEGAL_APPROVED","LEGAL_REJECTED"))
                .map(x->new Decision(x.getPublicId(),x.getVersionNo(),x.getSha256Hash(),x.getAllocationHash(),x.getDisputeStatus(),x.getReviewStatus(),
                    x.getReviewedByUserId()==null?null:users.findById(x.getReviewedByUserId()).map(u->u.getPublicId()).orElse(null),
                    x.getReviewedAt()==null?null:x.getReviewedAt().toInstant(ZoneOffset.UTC))).orElse(null);
            String courtResult=version==null?null:courtDecisions.findFirstByDossierVersionIdOrderByIdDesc(version.id()).map(CourtDecision::getResult).orElse(null);
            snapshot=new Snapshot(d.getPublicId(),latest,d.getRequiredVersionNo(),version==null?null:version.sha256(),hash,d.getDisputeStatus(),d.getReviewStatus(),fresh,current,decision,courtResult);
            ErrorCode base=baseBlocker(c,v,d,version);
            if(base==null) base=court.blocker(d);
            approvalReason=base!=null?base:(fresh?null:ErrorCode.LEGAL_DECISION_STALE);
            unlockReason=base;
            if(unlockReason==null) unlockReason=court.blocker(d);
            if(unlockReason==null) unlockReason=approvals.currentApprovalBlocker(d,version);
        }
        return new Context(c.getPublicId(),c.getCaseNumber(),v.getPublicId(),c.getStatus(),v.getStatus(),references,will,
            d==null?null:dossiers.view(c,true),snapshot,new Capabilities(action(approvalReason),action(unlockReason)),Instant.now());
    }
    private static ErrorCode baseBlocker(VerificationCase c,Vault vault,LegalBasisDossier d,CourtEvidenceVersion version) {
        if(!c.isOpen()) return ErrorCode.BASIS_DOSSIER_INVALID_STATE;
        if(Vault.STATUS_ON_HOLD.equals(vault.getStatus()) || LegalBasisDossier.ROUTE_ON_HOLD.equals(d.getRoute())) return ErrorCode.LEGAL_WORKFLOW_ON_HOLD;
        if(!Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(vault.getStatus()) || !LegalBasisDossier.STATUS_FORWARDED.equals(d.getStatus())
            || !d.acceptsIntake() || version==null || version.version()<d.getRequiredVersionNo() || !"FORWARDED".equals(version.forwardStatus())
            || version.sha256()==null || version.sha256().isBlank()) return ErrorCode.BASIS_DOSSIER_INVALID_STATE;
        return null;
    }
    private static Action action(ErrorCode reason) {return new Action(reason==null,reason==null?null:reason.name());}
}
