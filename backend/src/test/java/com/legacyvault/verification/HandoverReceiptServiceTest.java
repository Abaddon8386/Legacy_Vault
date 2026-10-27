package com.legacyvault.verification;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.CreateHandoverReceiptRequest;
import com.legacyvault.verification.entity.HandoverReceipt;
import com.legacyvault.verification.entity.HandoverSession;
import com.legacyvault.verification.entity.HandoverSessionStatus;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.HandoverReceiptAssetRepository;
import com.legacyvault.verification.repository.HandoverReceiptRepository;
import com.legacyvault.verification.repository.HandoverSessionRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import com.legacyvault.verification.repository.ReceiptAllocationRow;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.HandoverReceiptService;
import com.legacyvault.verification.service.LegalBasisCaseAccess;
import com.legacyvault.verification.service.LegalWorkflowGuard;
import com.legacyvault.verification.repository.CourtEvidenceVersion;
import com.legacyvault.vault.entity.Vault;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class HandoverReceiptServiceTest {
    private static final UUID CASE_PUBLIC_ID = UUID.randomUUID();
    private static final UUID SESSION_PUBLIC_ID = UUID.randomUUID();
    private static final UUID RECEIPT_PUBLIC_ID = UUID.randomUUID();
    private static final UUID RECIPIENT_PUBLIC_ID = UUID.randomUUID();
    private static final UUID ASSET_PUBLIC_ID = UUID.randomUUID();
    private static final UUID STAFF_PUBLIC_ID = UUID.randomUUID();
    private static final CustomUserPrincipal STAFF = new CustomUserPrincipal(31L, STAFF_PUBLIC_ID, "staff@example.test");

    private final VerificationCaseRepository cases = mock(VerificationCaseRepository.class);
    private final HandoverSessionRepository sessions = mock(HandoverSessionRepository.class);
    private final HandoverReceiptRepository receipts = mock(HandoverReceiptRepository.class);
    private final HandoverReceiptAssetRepository receiptAssets = mock(HandoverReceiptAssetRepository.class);
    private final LegalWorkflowGuard workflow = mock(LegalWorkflowGuard.class);
    private final LegalBasisDossierVersionRepository versions = mock(LegalBasisDossierVersionRepository.class);
    private final LegalBasisVersionAllocationRepository allocations = mock(LegalBasisVersionAllocationRepository.class);
    private final AuditService audit = mock(AuditService.class);
    private final com.legacyvault.verification.repository.HandoverCompletionEvidenceRepository evidence =
            mock(com.legacyvault.verification.repository.HandoverCompletionEvidenceRepository.class);
    private final HandoverReceiptService service = new HandoverReceiptService(cases, sessions, receipts,
            receiptAssets, workflow, versions, allocations, audit,
            evidence);
    private final VerificationCase verificationCase = mock(VerificationCase.class);
    private final LegalBasisDossier dossier = mock(LegalBasisDossier.class);
    private final Vault vault = mock(Vault.class);
    private final HandoverSession session = mock(HandoverSession.class);
    private final HandoverReceipt receipt = mock(HandoverReceipt.class);

    @BeforeEach
    void setUp() {
        when(cases.findByPublicIdAndAssignedStaffUserId(CASE_PUBLIC_ID, STAFF.userId()))
                .thenReturn(Optional.of(verificationCase));
        when(verificationCase.getVerificationCaseId()).thenReturn(91L);
        when(verificationCase.getAssignedStaffUserId()).thenReturn(STAFF.userId());
        when(dossier.getLegalBasisDossierId()).thenReturn(71L);
        when(vault.getStatus()).thenReturn(Vault.STATUS_UNLOCKED);
        when(workflow.requireProtectedTransition(CASE_PUBLIC_ID, LegalWorkflowGuard.ProtectedTransition.HANDOVER))
                .thenReturn(new LegalBasisCaseAccess.LockedCase(vault, verificationCase, dossier));
        when(sessions.findByPublicIdAndCaseAndStaffForUpdate(SESSION_PUBLIC_ID, 91L, STAFF.userId()))
                .thenReturn(Optional.of(session));
        when(session.getId()).thenReturn(101L);
        when(session.getPublicId()).thenReturn(SESSION_PUBLIC_ID);
        when(session.getStatus()).thenReturn(HandoverSessionStatus.COMPLETED);
        when(versions.findMaxVersionNo(71L)).thenReturn(4);
        when(versions.findCourtEvidence(71L, 4)).thenReturn(Optional.of(
                new CourtEvidenceVersion(701L, 4, "a".repeat(64), "COURT_JUDGMENT", null, null,
                        null, "FORWARDED", true)));
        when(allocations.findReceiptRowsByDossier(71L)).thenReturn(List.of(
                new ReceiptAllocationRow(4, 401L, 501L, ASSET_PUBLIC_ID, 601L, RECIPIENT_PUBLIC_ID,
                        "VERIFIED_AT_COUNTER", "APPROVED", "approved scope")));
        when(receipts.saveAndFlush(any(HandoverReceipt.class))).thenReturn(receipt);
        when(receipt.getId()).thenReturn(801L);
        when(receipt.getPublicId()).thenReturn(RECEIPT_PUBLIC_ID);
        when(receipt.getHandoverSessionId()).thenReturn(101L);
        when(receipt.getDossierVersionNo()).thenReturn(4);
        when(receipt.getSha256Hash()).thenReturn("a".repeat(64));
        when(receipt.getAllocationHash()).thenReturn("b".repeat(64));
        when(receipt.getConfirmationType()).thenReturn(HandoverReceipt.STAFF_ATTESTATION);
        when(receipt.getConfirmedAt()).thenReturn(LocalDateTime.parse("2026-10-18T10:00:00"));
        when(receipt.getSupersedesReceiptId()).thenReturn(null);
        when(receiptAssets.findAssetPublicIds(801L)).thenReturn(List.of(ASSET_PUBLIC_ID));
        when(receipts.findRecipientPublicId(801L)).thenReturn(Optional.of(RECIPIENT_PUBLIC_ID));
        when(receipts.findRecipientName(801L)).thenReturn(Optional.of("Nguyen Van A"));
        when(receipts.findStaffPublicId(801L)).thenReturn(Optional.of(STAFF_PUBLIC_ID));
        when(sessions.findById(101L)).thenReturn(Optional.of(session));
    }

    @Test
    void completedSessionAloneCannotIssueReceiptWithoutCompletionEvidence() {
        assertThatThrownBy(() -> create()).isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.HANDOVER_RECEIPT_INVALID_STATE);
        verifyNoInteractions(receipts, receiptAssets, audit);
    }

    @Test
    void matchingImmutableCompletionEvidenceEnablesStaffAttestation() {
        var proof = mock(com.legacyvault.verification.entity.HandoverCompletionEvidence.class);
        when(evidence.findBySessionId(101L)).thenReturn(Optional.of(proof));
        when(proof.getVersionId()).thenReturn(701L);
        when(proof.getSha256()).thenReturn("a".repeat(64));
        when(proof.getScopeHash()).thenReturn("b".repeat(64));
        when(dossier.getLastReviewedAllocationHash()).thenReturn("b".repeat(64));
        var result = (com.legacyvault.verification.dto.HandoverReceiptResponse) create();
        assertThat(result.confirmationType()).isEqualTo(HandoverReceipt.STAFF_ATTESTATION);
        assertThat(result.recipientName()).isEqualTo("Nguyen Van A");
        verify(receipts).saveAndFlush(any());
        verify(receiptAssets).saveAllAndFlush(any());
        verify(audit).record(any());
    }

    @Test
    void openSessionIsRejectedBeforeReceiptPersistence() {
        when(session.getStatus()).thenReturn(HandoverSessionStatus.OPEN);
        assertThatThrownBy(() -> create()).isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.HANDOVER_RECEIPT_INVALID_STATE);
        verifyNoInteractions(receipts, receiptAssets, audit);
    }

    @Test
    void onlyAssetsForTheApprovedRecipientCanBeRecorded() {
        assertThatThrownBy(() -> service.create(CASE_PUBLIC_ID, SESSION_PUBLIC_ID,
                new CreateHandoverReceiptRequest(RECIPIENT_PUBLIC_ID, List.of(UUID.randomUUID()), null), STAFF))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.HANDOVER_RECEIPT_INVALID_STATE);
        verifyNoInteractions(receipts, receiptAssets, audit);
    }

    @Test
    void recipientMustHaveCurrentAtCounterIdentityVerification() {
        when(allocations.findReceiptRowsByDossier(71L)).thenReturn(List.of(
                new ReceiptAllocationRow(4, 401L, 501L, ASSET_PUBLIC_ID, 601L, RECIPIENT_PUBLIC_ID,
                        "NOT_VERIFIED", "APPROVED", "approved scope")));
        assertThatThrownBy(() -> create()).isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.HANDOVER_RECEIPT_INVALID_STATE);
        verifyNoInteractions(receipts, receiptAssets, audit);
    }

    @Test
    void replacementCannotBeIssuedUntilCompletionEvidenceIsAvailable() {
        UUID oldPublicId = UUID.randomUUID();
        HandoverReceipt old = mock(HandoverReceipt.class);
        when(old.getId()).thenReturn(802L);
        when(old.getPublicId()).thenReturn(oldPublicId);
        when(receipts.findForReplacement(oldPublicId, 101L, 601L)).thenReturn(Optional.of(old));
        when(receipts.existsBySupersedesReceiptId(802L)).thenReturn(false);
        when(receipt.getSupersedesReceiptId()).thenReturn(802L);
        when(receipts.findById(802L)).thenReturn(Optional.of(old));

        assertThatThrownBy(() -> service.create(CASE_PUBLIC_ID, SESSION_PUBLIC_ID,
                new CreateHandoverReceiptRequest(RECIPIENT_PUBLIC_ID, List.of(ASSET_PUBLIC_ID), oldPublicId), STAFF))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.HANDOVER_RECEIPT_INVALID_STATE);
        verify(receipts, never()).saveAndFlush(any());
        verify(receipts, never()).delete(any());
    }

    @Test
    void sessionReceiptHistoryCanBeRetrievedByAssignedStaff() {
        when(sessions.findByPublicIdAndVerificationCaseIdAndStaffUserId(SESSION_PUBLIC_ID, 91L, STAFF.userId()))
                .thenReturn(Optional.of(session));
        when(receipts.findByHandoverSessionIdOrderByConfirmedAtDesc(101L)).thenReturn(List.of(receipt));
        var items = service.list(CASE_PUBLIC_ID, SESSION_PUBLIC_ID, STAFF);
        assertThat(items).hasSize(1);
        assertThat(items.get(0).recipientName()).isEqualTo("Nguyen Van A");

        when(receipts.findByPublicIdAndHandoverSessionId(RECEIPT_PUBLIC_ID, 101L)).thenReturn(Optional.of(receipt));
        var single = service.get(CASE_PUBLIC_ID, SESSION_PUBLIC_ID, RECEIPT_PUBLIC_ID, STAFF);
        assertThat(single.receiptId()).isEqualTo(RECEIPT_PUBLIC_ID);
        assertThat(single.recipientName()).isEqualTo("Nguyen Van A");
    }

    @Test
    void nonAssignedStaffCannotCreateOrReadReceipts() {
        when(cases.findByPublicIdAndAssignedStaffUserId(CASE_PUBLIC_ID, STAFF.userId())).thenReturn(Optional.empty());
        assertThatThrownBy(() -> create()).isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
        verifyNoInteractions(workflow, receipts, receiptAssets, audit);
    }

    @Test
    void auditIsNotWrittenForUnverifiedCompletion() {
        assertThatThrownBy(() -> create()).isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.HANDOVER_RECEIPT_INVALID_STATE);
        verifyNoInteractions(receipts, receiptAssets, audit);
    }

    @Test
    void missingLegalAssignmentIsRejectedBeforeSessionLookup() {
        when(verificationCase.getAssignedStaffUserId()).thenReturn(999L);
        assertThatThrownBy(() -> create()).isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.HANDOVER_RECEIPT_INVALID_STATE);
        verify(sessions, never()).findByPublicIdAndCaseAndStaffForUpdate(any(), any(), any());
    }

    private Object create() {
        return service.create(CASE_PUBLIC_ID, SESSION_PUBLIC_ID,
                new CreateHandoverReceiptRequest(RECIPIENT_PUBLIC_ID, List.of(ASSET_PUBLIC_ID), null), STAFF);
    }
}
