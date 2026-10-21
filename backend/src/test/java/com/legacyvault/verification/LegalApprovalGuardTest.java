package com.legacyvault.verification;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.LegalBasisReviewHistory;
import com.legacyvault.verification.repository.AllocationRow;
import com.legacyvault.verification.repository.CourtEvidenceVersion;
import com.legacyvault.verification.repository.LegalBasisReviewHistoryRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import com.legacyvault.verification.service.LegalApprovalGuard;
import com.legacyvault.verification.service.LegalBasisReviewService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class LegalApprovalGuardTest {
    private static final Long DOSSIER_ID = 50L;
    private static final Long VERSION_ID = 70L;
    private static final int VERSION_NO = 3;
    private static final String HASH = "a".repeat(64);
    private static final String ALLOCATION_HASH = LegalBasisReviewService.allocationHashFromCanonicalValues(List.of());

    private final LegalBasisReviewHistoryRepository history = mock(LegalBasisReviewHistoryRepository.class);
    private final LegalBasisVersionAllocationRepository allocations = mock(LegalBasisVersionAllocationRepository.class);
    private final LegalApprovalGuard guard = new LegalApprovalGuard(history, allocations);
    private final LegalBasisDossier dossier = mock(LegalBasisDossier.class);
    private final CourtEvidenceVersion current = new CourtEvidenceVersion(VERSION_ID, VERSION_NO, HASH,
            "COURT_JUDGMENT", "Authority", "DOC-3", null, "FORWARDED", true);

    @BeforeEach
    void setUp() {
        when(dossier.getLegalBasisDossierId()).thenReturn(DOSSIER_ID);
        when(dossier.getRoute()).thenReturn("COURT");
        when(dossier.getReviewStatus()).thenReturn("FRESH");
        when(dossier.getLastReviewedVersionNo()).thenReturn(VERSION_NO);
        when(dossier.getLastReviewedSha256Hash()).thenReturn(HASH);
        when(dossier.getLastReviewedDisputeStatus()).thenReturn("NONE");
        when(dossier.getLastReviewedAllocationHash()).thenReturn(ALLOCATION_HASH);
        when(dossier.getDisputeStatus()).thenReturn("NONE");
        when(allocations.findRowsByDossier(DOSSIER_ID)).thenReturn(List.of());
    }

    @Test
    void matchingApprovalAllowsCurrentSnapshot() {
        when(history.findFirstByDossierIdAndVersionNoAndReviewStatusInOrderByIdDesc(
                DOSSIER_ID, VERSION_NO, List.of("LEGAL_APPROVED", "LEGAL_REJECTED")))
                .thenReturn(Optional.of(decision(VERSION_NO, VERSION_ID, HASH, "NONE", ALLOCATION_HASH,
                        "LEGAL_APPROVED", "APPROVE")));

        guard.requireCurrentApproval(dossier, current);

        verify(history).findFirstByDossierIdAndVersionNoAndReviewStatusInOrderByIdDesc(
                DOSSIER_ID, VERSION_NO, List.of("LEGAL_APPROVED", "LEGAL_REJECTED"));
    }

    @Test
    void missingOrRejectedApprovalBlocksProtectedTransition() {
        when(history.findFirstByDossierIdAndVersionNoAndReviewStatusInOrderByIdDesc(
                DOSSIER_ID, VERSION_NO, List.of("LEGAL_APPROVED", "LEGAL_REJECTED")))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(decision(VERSION_NO, VERSION_ID, HASH, "NONE", ALLOCATION_HASH,
                        "LEGAL_REJECTED", "REJECT")));

        assertBlocked(ErrorCode.LEGAL_APPROVAL_REQUIRED);
        assertBlocked(ErrorCode.LEGAL_APPROVAL_REQUIRED);
    }

    @Test
    void decisionMustMatchCurrentHashVersionIdDisputeAndAllocationScope() {
        when(history.findFirstByDossierIdAndVersionNoAndReviewStatusInOrderByIdDesc(
                DOSSIER_ID, VERSION_NO, List.of("LEGAL_APPROVED", "LEGAL_REJECTED")))
                .thenReturn(Optional.of(decision(VERSION_NO, VERSION_ID, "b".repeat(64), "NONE", ALLOCATION_HASH,
                                "LEGAL_APPROVED", "APPROVE")))
                .thenReturn(Optional.of(decision(VERSION_NO, VERSION_ID + 1, HASH, "NONE", ALLOCATION_HASH,
                        "LEGAL_APPROVED", "APPROVE")))
                .thenReturn(Optional.of(decision(VERSION_NO, VERSION_ID, HASH, "DISPUTED", ALLOCATION_HASH,
                        "LEGAL_APPROVED", "APPROVE")))
                .thenReturn(Optional.of(decision(VERSION_NO, VERSION_ID, HASH, "NONE", "c".repeat(64),
                        "LEGAL_APPROVED", "APPROVE")));

        assertBlocked(ErrorCode.LEGAL_DECISION_STALE);
        assertBlocked(ErrorCode.LEGAL_DECISION_STALE);
        assertBlocked(ErrorCode.LEGAL_DECISION_STALE);
        assertBlocked(ErrorCode.LEGAL_DECISION_STALE);
    }

    @Test
    void currentVersionLookupDoesNotInvalidateUnrelatedPriorVersionApproval() {
        when(history.findFirstByDossierIdAndVersionNoAndReviewStatusInOrderByIdDesc(
                DOSSIER_ID, VERSION_NO - 1, List.of("LEGAL_APPROVED", "LEGAL_REJECTED")))
                .thenReturn(Optional.of(decision(VERSION_NO - 1, VERSION_ID - 1, HASH, "NONE", ALLOCATION_HASH,
                        "LEGAL_APPROVED", "APPROVE")));
        when(history.findFirstByDossierIdAndVersionNoAndReviewStatusInOrderByIdDesc(
                DOSSIER_ID, VERSION_NO, List.of("LEGAL_APPROVED", "LEGAL_REJECTED")))
                .thenReturn(Optional.empty());

        assertBlocked(ErrorCode.LEGAL_APPROVAL_REQUIRED);

        verify(history).findFirstByDossierIdAndVersionNoAndReviewStatusInOrderByIdDesc(
                DOSSIER_ID, VERSION_NO, List.of("LEGAL_APPROVED", "LEGAL_REJECTED"));
        org.mockito.Mockito.verify(history, org.mockito.Mockito.never())
                .findFirstByDossierIdAndVersionNoAndReviewStatusInOrderByIdDesc(
                        DOSSIER_ID, VERSION_NO - 1, List.of("LEGAL_APPROVED", "LEGAL_REJECTED"));
    }

    @Test
    void pendingRereviewAndChangedAllocationScopeMakeApprovalStale() {
        when(dossier.getReviewStatus()).thenReturn("REVIEW_REQUIRED");
        assertBlocked(ErrorCode.LEGAL_DECISION_STALE);
        verifyNoInteractions(history);

        when(dossier.getReviewStatus()).thenReturn("FRESH");
        when(allocations.findRowsByDossier(DOSSIER_ID)).thenReturn(List.of(
                new AllocationRow(VERSION_NO, UUID.randomUUID(), UUID.randomUUID(), "changed scope")));
        assertBlocked(ErrorCode.LEGAL_DECISION_STALE);
        verifyNoInteractions(history);
    }

    private void assertBlocked(ErrorCode expected) {
        assertThatThrownBy(() -> guard.requireCurrentApproval(dossier, current))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(expected);
    }

    private static LegalBasisReviewHistory decision(int versionNo, Long versionId, String hash, String dispute,
            String allocationHash, String status, String reasonCode) {
        return new LegalBasisReviewHistory(DOSSIER_ID, versionId, versionNo, hash, dispute,
                allocationHash, status, reasonCode, "reason", 5L);
    }
}
