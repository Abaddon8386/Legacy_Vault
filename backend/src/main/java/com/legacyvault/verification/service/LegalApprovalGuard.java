package com.legacyvault.verification.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.LegalBasisReviewHistory;
import com.legacyvault.verification.repository.AllocationRow;
import com.legacyvault.verification.repository.CourtEvidenceVersion;
import com.legacyvault.verification.repository.LegalBasisReviewHistoryRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;

/**
 * Verifies that the latest Legal approval still covers the authoritative dossier snapshot.
 * Invalidation is derived from immutable version/scope records and the already audited dossier changes;
 * this read-only gate avoids writing duplicate invalidation events for repeated transition attempts.
 */
@Component
public class LegalApprovalGuard {
    private static final String APPROVED = "LEGAL_APPROVED";
    private static final String REJECTED = "LEGAL_REJECTED";
    private static final String APPROVE_REASON_CODE = "APPROVE";

    private final LegalBasisReviewHistoryRepository history;
    private final LegalBasisVersionAllocationRepository allocations;

    public LegalApprovalGuard(LegalBasisReviewHistoryRepository history,
            LegalBasisVersionAllocationRepository allocations) {
        this.history = history;
        this.allocations = allocations;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void requireCurrentApproval(LegalBasisDossier dossier, CourtEvidenceVersion currentVersion) {
        String currentAllocationHash = allocationHash(dossier.getLegalBasisDossierId(), currentVersion.version());
        if (!"FRESH".equals(dossier.getReviewStatus())
                || !Objects.equals(dossier.getLastReviewedVersionNo(), currentVersion.version())
                || !sameHash(dossier.getLastReviewedSha256Hash(), currentVersion.sha256())
                || !Objects.equals(dossier.getLastReviewedDisputeStatus(), dossier.getDisputeStatus())
                || !sameHash(dossier.getLastReviewedAllocationHash(), currentAllocationHash)) {
            throw new BusinessException(ErrorCode.LEGAL_DECISION_STALE);
        }

        LegalBasisReviewHistory decision = history
                .findFirstByDossierIdAndVersionNoAndReviewStatusInOrderByIdDesc(
                        dossier.getLegalBasisDossierId(), currentVersion.version(), List.of(APPROVED, REJECTED))
                .orElseThrow(() -> new BusinessException(ErrorCode.LEGAL_APPROVAL_REQUIRED));
        if (REJECTED.equals(decision.getReviewStatus())) {
            throw new BusinessException(ErrorCode.LEGAL_APPROVAL_REQUIRED);
        }
        if (!APPROVED.equals(decision.getReviewStatus())
                || !APPROVE_REASON_CODE.equals(decision.getReasonCode())
                || !Objects.equals(decision.getDossierVersionId(), currentVersion.id())
                || !sameHash(decision.getSha256Hash(), currentVersion.sha256())
                || !Objects.equals(decision.getDisputeStatus(), dossier.getDisputeStatus())
                || !sameHash(decision.getAllocationHash(), currentAllocationHash)) {
            throw new BusinessException(ErrorCode.LEGAL_DECISION_STALE);
        }
    }

    private String allocationHash(Long dossierId, int versionNo) {
        List<String> canonicalValues = allocations.findRowsByDossier(dossierId).stream()
                .filter(row -> row.versionNo() == versionNo)
                .map(LegalApprovalGuard::canonicalValue)
                .toList();
        return LegalBasisReviewService.allocationHashFromCanonicalValues(canonicalValues);
    }

    private static String canonicalValue(AllocationRow row) {
        return String.valueOf(row.assetId()) + "|" + String.valueOf(row.beneficiaryId()) + "|"
                + String.valueOf(row.description());
    }

    private static boolean sameHash(String first, String second) {
        return first != null && second != null && first.equalsIgnoreCase(second);
    }
}
