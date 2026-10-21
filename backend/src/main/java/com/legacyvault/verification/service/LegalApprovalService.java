package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.verification.dto.LegalApprovalRequest;
import com.legacyvault.verification.dto.LegalApprovalResponse;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.LegalBasisDossierVersion;
import com.legacyvault.verification.entity.LegalBasisReviewHistory;
import com.legacyvault.verification.entity.LegalBasisVersionAllocation;
import com.legacyvault.verification.repository.AllocationRow;
import com.legacyvault.verification.repository.BasisVersionRow;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.LegalBasisReviewHistoryRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

@Service
public class LegalApprovalService {
    private static final String ENTITY_TYPE = "LEGAL_BASIS_DOSSIER";

    private final LegalBasisCaseAccess access;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalBasisVersionAllocationRepository allocations;
    private final LegalBasisReviewHistoryRepository history;
    private final AuditService audit;
    private final CourtRouteGuard court;

    public LegalApprovalService(LegalBasisCaseAccess access,
            LegalBasisDossierVersionRepository versions,
            LegalBasisVersionAllocationRepository allocations,
            LegalBasisReviewHistoryRepository history,
            AuditService audit, CourtRouteGuard court) {
        this.access = access;
        this.versions = versions;
        this.allocations = allocations;
        this.history = history;
        this.audit = audit;
        this.court = court;
    }

    @Transactional
    public LegalApprovalResponse decide(UUID caseId, CustomUserPrincipal principal, LegalApprovalRequest request) {
        Long actorId = CustomUserPrincipal.requireUserId(principal);
        if (caseId == null || request == null || request.decision() == null
                || request.versionNo() == null || request.versionNo() < 1
                || request.sha256Hash() == null || request.allocationHash() == null
                || (request.decision() == LegalApprovalRequest.Decision.REJECT
                && (request.reason() == null || request.reason().isBlank()))) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        LegalBasisCaseAccess.LockedCase locked = access.lock(caseId);
        locked.requireOpen();
        LegalBasisDossier dossier = locked.dossier();
        Vault vault = locked.vault();
        LegalWorkflowGuard.requireNotOnHold(vault, dossier);
        if (!Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(vault.getStatus())
                || !LegalBasisDossier.STATUS_FORWARDED.equals(dossier.getStatus())
                || !dossier.acceptsIntake()) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        court.requireValidDecision(dossier);

        List<BasisVersionRow> rows = versions.findRows(dossier.getLegalBasisDossierId());
        BasisVersionRow current = rows.isEmpty() ? null : rows.get(0);
        if (current == null || current.sha256Hash() == null || current.sha256Hash().isBlank()
                || !LegalBasisDossierVersion.FORWARDED.equals(current.forwardStatus())
                || current.versionNo() < dossier.getRequiredVersionNo()) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        String currentAllocationHash = allocationHash(dossier.getLegalBasisDossierId(), current.versionNo());
        if (!Objects.equals(request.versionNo(), current.versionNo())
                || !current.sha256Hash().equalsIgnoreCase(request.sha256Hash())
                || !currentAllocationHash.equalsIgnoreCase(request.allocationHash())) {
            throw new BusinessException(ErrorCode.LEGAL_DECISION_STALE);
        }
        if (!"FRESH".equals(dossier.getReviewStatus())
                || !Objects.equals(dossier.getLastReviewedVersionNo(), current.versionNo())
                || !sameHash(dossier.getLastReviewedSha256Hash(), current.sha256Hash())
                || !Objects.equals(dossier.getLastReviewedDisputeStatus(), dossier.getDisputeStatus())
                || !sameHash(dossier.getLastReviewedAllocationHash(), currentAllocationHash)) {
            throw new BusinessException(ErrorCode.LEGAL_DECISION_STALE);
        }

        Long versionId = versions.findByLegalBasisDossierIdAndVersionNo(
                        dossier.getLegalBasisDossierId(), current.versionNo())
                .map(LegalBasisDossierVersion::getDossierVersionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.LEGAL_DECISION_STALE));
        String decision = request.decision() == LegalApprovalRequest.Decision.APPROVE
                ? "LEGAL_APPROVED" : "LEGAL_REJECTED";
        allocations.updateStatusForVersion(versionId,
                request.decision() == LegalApprovalRequest.Decision.APPROVE
                        ? LegalBasisVersionAllocation.STATUS_APPROVED
                        : LegalBasisVersionAllocation.STATUS_REJECTED);
        String reason = request.reason() == null ? "" : request.reason().trim();
        history.save(new LegalBasisReviewHistory(
                dossier.getLegalBasisDossierId(), versionId, current.versionNo(), current.sha256Hash(),
                dossier.getDisputeStatus(), currentAllocationHash, decision,
                request.decision().name(), reason, actorId));
        audit.record(new AuditEvent(
                AuditAction.LEGAL_BASIS_DECIDED, AuditActorType.USER, actorId, vault.getVaultId(),
                ENTITY_TYPE, dossier.getLegalBasisDossierId(), dossier.getReviewStatus(), decision, null,
                Map.of("decision", request.decision().name(), "versionNo", current.versionNo(),
                        "sha256Hash", current.sha256Hash(), "allocationHash", currentAllocationHash),
                "ST-21", "LV-LEG-001"));

        return new LegalApprovalResponse(dossier.getPublicId(), decision, current.versionNo(),
                current.sha256Hash(), currentAllocationHash, principal.publicId(), LocalDateTime.now(ZoneOffset.UTC));
    }

    private String allocationHash(Long dossierId, int versionNo) {
        List<AllocationRow> rows = allocations.findRowsByDossier(dossierId).stream()
                .filter(row -> row.versionNo() == versionNo)
                .toList();
        return AllocationScopeHash.hashApprovalRows(rows);
    }

    private static boolean sameHash(String first, String second) {
        return first != null && second != null && first.equalsIgnoreCase(second);
    }
}
