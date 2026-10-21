package com.legacyvault.verification;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.verification.dto.LegalApprovalRequest;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.LegalBasisDossierVersion;
import com.legacyvault.verification.entity.LegalBasisReviewHistory;
import com.legacyvault.verification.entity.LegalBasisVersionAllocation;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.BasisVersionRow;
import com.legacyvault.verification.repository.AllocationRow;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.LegalBasisReviewHistoryRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import com.legacyvault.verification.service.LegalApprovalService;
import com.legacyvault.verification.service.LegalBasisCaseAccess;
import com.legacyvault.verification.service.LegalBasisReviewService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class LegalApprovalServiceTest {
    private static final Long DOSSIER_ID = 10L;
    private static final Long VERSION_ID = 12L;
    private static final Long VAULT_ID = 14L;
    private static final Long USER_ID = 20L;
    private static final int VERSION_NO = 2;
    private static final String HASH = "a".repeat(64);
    private static final String ALLOCATION_HASH =
            LegalBasisReviewService.allocationHashFromCanonicalValues(List.of());
    private static final UUID CASE_ID = UUID.randomUUID();
    private static final UUID DOSSIER_PUBLIC_ID = UUID.randomUUID();

    private final LegalBasisCaseAccess access = mock(LegalBasisCaseAccess.class);
    private final LegalBasisDossierVersionRepository versions = mock(LegalBasisDossierVersionRepository.class);
    private final LegalBasisVersionAllocationRepository allocations = mock(LegalBasisVersionAllocationRepository.class);
    private final LegalBasisReviewHistoryRepository history = mock(LegalBasisReviewHistoryRepository.class);
    private final AuditService audit = mock(AuditService.class);
    private final LegalApprovalService service = new LegalApprovalService(access, versions, allocations, history, audit, org.mockito.Mockito.mock(com.legacyvault.verification.service.CourtRouteGuard.class));
    private final LegalBasisDossier dossier = mock(LegalBasisDossier.class);
    private final VerificationCase verificationCase = mock(VerificationCase.class);
    private final Vault vault = mock(Vault.class);
    private final CustomUserPrincipal principal = new CustomUserPrincipal(USER_ID, UUID.randomUUID(), "legal@example.test");

    @BeforeEach
    void setUp() {
        when(access.lock(CASE_ID)).thenReturn(new LegalBasisCaseAccess.LockedCase(vault, verificationCase, dossier));
        when(verificationCase.isOpen()).thenReturn(true);
        when(vault.getStatus()).thenReturn(Vault.STATUS_LEGAL_BASIS_VERIFICATION);
        when(vault.getVaultId()).thenReturn(VAULT_ID);
        when(dossier.getLegalBasisDossierId()).thenReturn(DOSSIER_ID);
        when(dossier.getPublicId()).thenReturn(DOSSIER_PUBLIC_ID);
        when(dossier.getStatus()).thenReturn(LegalBasisDossier.STATUS_FORWARDED);
        when(dossier.getRoute()).thenReturn(LegalBasisDossier.ROUTE_COURT);
        when(dossier.acceptsIntake()).thenReturn(true);
        when(dossier.getRequiredVersionNo()).thenReturn(1);
        when(dossier.getReviewStatus()).thenReturn("FRESH");
        when(dossier.getLastReviewedVersionNo()).thenReturn(VERSION_NO);
        when(dossier.getLastReviewedSha256Hash()).thenReturn(HASH);
        when(dossier.getLastReviewedDisputeStatus()).thenReturn(LegalBasisDossier.DISPUTE_NONE);
        when(dossier.getLastReviewedAllocationHash()).thenReturn(ALLOCATION_HASH);
        when(dossier.getDisputeStatus()).thenReturn(LegalBasisDossier.DISPUTE_NONE);
        when(versions.findRows(DOSSIER_ID)).thenReturn(List.of(row(VERSION_NO, HASH, "FORWARDED")));
        when(allocations.findRowsByDossier(DOSSIER_ID)).thenReturn(List.of());
        LegalBasisDossierVersion version = mock(LegalBasisDossierVersion.class);
        when(version.getDossierVersionId()).thenReturn(VERSION_ID);
        when(versions.findByLegalBasisDossierIdAndVersionNo(DOSSIER_ID, VERSION_NO))
                .thenReturn(Optional.of(version));
    }

    @Test
    void approve_persistsDecisionSnapshotAndAuditAtomically() {
        var response = service.decide(CASE_ID, principal,
                request(LegalApprovalRequest.Decision.APPROVE, VERSION_NO, HASH, ALLOCATION_HASH, null));

        assertThat(response.decision()).isEqualTo("LEGAL_APPROVED");
        assertThat(response.decidedBy()).isEqualTo(principal.publicId());
        ArgumentCaptor<LegalBasisReviewHistory> saved = ArgumentCaptor.forClass(LegalBasisReviewHistory.class);
        verify(history).save(saved.capture());
        assertThat(saved.getValue().getReviewStatus()).isEqualTo("LEGAL_APPROVED");
        assertThat(saved.getValue().getDossierVersionId()).isEqualTo(VERSION_ID);
        assertThat(saved.getValue().getSha256Hash()).isEqualTo(HASH);
        assertThat(saved.getValue().getAllocationHash()).isEqualTo(ALLOCATION_HASH);
        assertThat(saved.getValue().getReviewedByUserId()).isEqualTo(USER_ID);
        verify(allocations).updateStatusForVersion(VERSION_ID, LegalBasisVersionAllocation.STATUS_APPROVED);
        ArgumentCaptor<AuditEvent> event = ArgumentCaptor.forClass(AuditEvent.class);
        verify(audit).record(event.capture());
        assertThat(event.getValue().action()).isEqualTo(AuditAction.LEGAL_BASIS_DECIDED);
        assertThat(event.getValue().context()).doesNotContainKey("reason");
        InOrder order = inOrder(history, audit);
        order.verify(history).save(any(LegalBasisReviewHistory.class));
        order.verify(audit).record(any(AuditEvent.class));
    }

    @Test
    void reject_persistsRequiredReason() {
        service.decide(CASE_ID, principal,
                request(LegalApprovalRequest.Decision.REJECT, VERSION_NO, HASH, ALLOCATION_HASH, "Missing evidence"));
        ArgumentCaptor<LegalBasisReviewHistory> saved = ArgumentCaptor.forClass(LegalBasisReviewHistory.class);
        verify(history).save(saved.capture());
        assertThat(saved.getValue().getReviewStatus()).isEqualTo("LEGAL_REJECTED");
        assertThat(saved.getValue().getReason()).isEqualTo("Missing evidence");
        verify(allocations).updateStatusForVersion(VERSION_ID, LegalBasisVersionAllocation.STATUS_REJECTED);
    }

    @Test
    void rejectWithoutReason_isRejectedBeforeWrites() {
        assertThatThrownBy(() -> service.decide(CASE_ID, principal,
                request(LegalApprovalRequest.Decision.REJECT, VERSION_NO, HASH, ALLOCATION_HASH, " ")))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.VALIDATION_FAILED);
        verifyNoInteractions(history, audit);
    }

    @Test
    void mismatchedVersionHashOrAllocationScope_isRejectedWithoutDecision() {
        assertStale(request(LegalApprovalRequest.Decision.APPROVE, VERSION_NO - 1, HASH, ALLOCATION_HASH, null));
        assertStale(request(LegalApprovalRequest.Decision.APPROVE, VERSION_NO, "b".repeat(64), ALLOCATION_HASH, null));
        assertStale(request(LegalApprovalRequest.Decision.APPROVE, VERSION_NO, HASH, "c".repeat(64), null));
        verifyNoInteractions(history, audit);
    }

    @Test
    void changedAuthoritativeVersionHashOrAllocation_invalidatesReviewSnapshot() {
        when(dossier.getLastReviewedVersionNo()).thenReturn(VERSION_NO - 1);
        assertStale(request(LegalApprovalRequest.Decision.APPROVE, VERSION_NO, HASH, ALLOCATION_HASH, null));
        when(dossier.getLastReviewedVersionNo()).thenReturn(VERSION_NO);
        when(dossier.getLastReviewedSha256Hash()).thenReturn("b".repeat(64));
        assertStale(request(LegalApprovalRequest.Decision.APPROVE, VERSION_NO, HASH, ALLOCATION_HASH, null));
        when(dossier.getLastReviewedSha256Hash()).thenReturn(HASH);
        when(dossier.getLastReviewedAllocationHash()).thenReturn("c".repeat(64));
        assertStale(request(LegalApprovalRequest.Decision.APPROVE, VERSION_NO, HASH, ALLOCATION_HASH, null));
        when(dossier.getLastReviewedAllocationHash()).thenReturn(ALLOCATION_HASH);
        when(allocations.findRowsByDossier(DOSSIER_ID)).thenReturn(List.of(
                new AllocationRow(VERSION_NO, UUID.randomUUID(), UUID.randomUUID(), "scope changed")));
        assertStale(request(LegalApprovalRequest.Decision.APPROVE, VERSION_NO, HASH, ALLOCATION_HASH, null));
        verifyNoInteractions(history, audit);
    }

    @Test
    void holdOrReviewRequiredBlocksDecision() {
        when(vault.getStatus()).thenReturn(Vault.STATUS_ON_HOLD);
        assertThatThrownBy(() -> service.decide(CASE_ID, principal,
                request(LegalApprovalRequest.Decision.APPROVE, VERSION_NO, HASH, ALLOCATION_HASH, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.LEGAL_WORKFLOW_ON_HOLD);
        when(vault.getStatus()).thenReturn(Vault.STATUS_LEGAL_BASIS_VERIFICATION);
        when(dossier.getReviewStatus()).thenReturn("REVIEW_REQUIRED");
        assertStale(request(LegalApprovalRequest.Decision.APPROVE, VERSION_NO, HASH, ALLOCATION_HASH, null));
        when(dossier.getReviewStatus()).thenReturn("FRESH");
        when(dossier.getRoute()).thenReturn(LegalBasisDossier.ROUTE_ON_HOLD);
        assertThatThrownBy(() -> service.decide(CASE_ID, principal,
                request(LegalApprovalRequest.Decision.APPROVE, VERSION_NO, HASH, ALLOCATION_HASH, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.LEGAL_WORKFLOW_ON_HOLD);
        verifyNoInteractions(history, audit);
    }

    @Test
    void notarialHistoryRequiresCourtDecisionBeforeApproval() {
        when(dossier.getRoute()).thenReturn(LegalBasisDossier.ROUTE_NOTARIAL);
        when(dossier.acceptsIntake()).thenReturn(false);

        assertThatThrownBy(() -> service.decide(CASE_ID, principal,
                request(LegalApprovalRequest.Decision.APPROVE, VERSION_NO, HASH, ALLOCATION_HASH, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.COURT_DECISION_REQUIRED);
        verifyNoInteractions(versions, allocations, history, audit);
    }

    @Test
    void auditFailurePropagatesSoCallerTransactionCanRollback() {
        doThrow(new IllegalStateException("audit unavailable")).when(audit).record(any());
        assertThatThrownBy(() -> service.decide(CASE_ID, principal,
                request(LegalApprovalRequest.Decision.APPROVE, VERSION_NO, HASH, ALLOCATION_HASH, null)))
                .isInstanceOf(IllegalStateException.class);
        verify(history).save(any(LegalBasisReviewHistory.class));
    }

    private void assertStale(LegalApprovalRequest request) {
        assertThatThrownBy(() -> service.decide(CASE_ID, principal, request))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.LEGAL_DECISION_STALE);
    }

    private static LegalApprovalRequest request(LegalApprovalRequest.Decision decision, int version,
            String hash, String allocationHash, String reason) {
        return new LegalApprovalRequest(decision, version, hash, allocationHash, reason);
    }

    private static BasisVersionRow row(int version, String hash, String forwardStatus) {
        return new BasisVersionRow(version, "COURT_JUDGMENT", "Authority", "DOC-1", null, null,
                null, null, null, null, "application/pdf", 100L, hash, forwardStatus, USER_ID, null, null);
    }
}
