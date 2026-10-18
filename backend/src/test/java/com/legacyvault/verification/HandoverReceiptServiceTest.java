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
    private final HandoverReceiptService service = new HandoverReceiptService(cases, sessions, receipts,
            receiptAssets, workflow, versions, allocations, audit);
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
                new CourtEvidenceVersion(701L, 4, "a".repeat(64), "NOTARIAL_PARTITION", null, null,
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
        when(receipts.findStaffPublicId(801L)).thenReturn(Optional.of(STAFF_PUBLIC_ID));
        when(sessions.findById(101L)).thenReturn(Optional.of(session));
    }

    @Test
    void createsStaffAttestationForApprovedRecipientAndAssetAfterCompletedSession() {
        var response = service.create(CASE_PUBLIC_ID, SESSION_PUBLIC_ID,
                new CreateHandoverReceiptRequest(RECIPIENT_PUBLIC_ID, List.of(ASSET_PUBLIC_ID), null), STAFF);

        assertThat(response.receiptId()).isEqualTo(RECEIPT_PUBLIC_ID);
        assertThat(response.recipientId()).isEqualTo(RECIPIENT_PUBLIC_ID);
        assertThat(response.assetIds()).containsExactly(ASSET_PUBLIC_ID);
        assertThat(response.staffId()).isEqualTo(STAFF_PUBLIC_ID);
        assertThat(response.confirmationType()).isEqualTo(HandoverReceipt.STAFF_ATTESTATION);
        verify(receipts).saveAndFlush(any(HandoverReceipt.class));
        verify(receiptAssets).saveAllAndFlush(any());
        org.mockito.ArgumentCaptor<AuditEvent> event = org.mockito.ArgumentCaptor.forClass(AuditEvent.class);
        verify(audit).record(event.capture());
        assertThat(event.getValue().action()).isEqualTo(AuditAction.HANDOVER_RECEIPT_STAFF_CONFIRMED);
        assertThat(event.getValue().context()).doesNotContainKey("documentContent");
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
                .isEqualTo(ErrorCode.HANDOVER_RECEIPT_ASSET_NOT_ALLOCATED);
        verifyNoInteractions(receipts, receiptAssets, audit);
    }

    @Test
    void recipientMustHaveCurrentAtCounterIdentityVerification() {
        when(allocations.findReceiptRowsByDossier(71L)).thenReturn(List.of(
                new ReceiptAllocationRow(4, 401L, 501L, ASSET_PUBLIC_ID, 601L, RECIPIENT_PUBLIC_ID,
                        "NOT_VERIFIED", "APPROVED", "approved scope")));
        assertThatThrownBy(() -> create()).isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.HANDOVER_RECEIPT_RECIPIENT_NOT_VERIFIED);
        verifyNoInteractions(receipts, receiptAssets, audit);
    }

    @Test
    void replacementCreatesNewReceiptLinkedToOldReceipt() {
        UUID oldPublicId = UUID.randomUUID();
        HandoverReceipt old = mock(HandoverReceipt.class);
        when(old.getId()).thenReturn(802L);
        when(old.getPublicId()).thenReturn(oldPublicId);
        when(receipts.findForReplacement(oldPublicId, 101L, 601L)).thenReturn(Optional.of(old));
        when(receipts.existsBySupersedesReceiptId(802L)).thenReturn(false);
        when(receipt.getSupersedesReceiptId()).thenReturn(802L);
        when(receipts.findById(802L)).thenReturn(Optional.of(old));

        var response = service.create(CASE_PUBLIC_ID, SESSION_PUBLIC_ID,
                new CreateHandoverReceiptRequest(RECIPIENT_PUBLIC_ID, List.of(ASSET_PUBLIC_ID), oldPublicId), STAFF);

        assertThat(response.receiptId()).isEqualTo(RECEIPT_PUBLIC_ID);
        assertThat(response.supersedesReceiptId()).isEqualTo(oldPublicId);
        org.mockito.ArgumentCaptor<HandoverReceipt> saved = org.mockito.ArgumentCaptor.forClass(HandoverReceipt.class);
        verify(receipts).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getSupersedesReceiptId()).isEqualTo(802L);
        verify(receipts, never()).delete(any());
    }

    @Test
    void sessionReceiptHistoryCanBeRetrievedByAssignedStaff() {
        when(sessions.findByPublicIdAndVerificationCaseIdAndStaffUserId(SESSION_PUBLIC_ID, 91L, STAFF.userId()))
                .thenReturn(Optional.of(session));
        when(receipts.findByHandoverSessionIdOrderByConfirmedAtDesc(101L)).thenReturn(List.of(receipt));
        assertThat(service.list(CASE_PUBLIC_ID, SESSION_PUBLIC_ID, STAFF)).hasSize(1);

        when(receipts.findByPublicIdAndHandoverSessionId(RECEIPT_PUBLIC_ID, 101L)).thenReturn(Optional.of(receipt));
        assertThat(service.get(CASE_PUBLIC_ID, SESSION_PUBLIC_ID, RECEIPT_PUBLIC_ID, STAFF).receiptId())
                .isEqualTo(RECEIPT_PUBLIC_ID);
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
    void auditFailurePropagatesAndReceiptWritesRemainInOneServiceTransaction() {
        doThrow(new IllegalStateException("audit unavailable")).when(audit).record(any(AuditEvent.class));
        assertThatThrownBy(() -> create()).isInstanceOf(IllegalStateException.class)
                .hasMessage("audit unavailable");
        verify(receipts).saveAndFlush(any(HandoverReceipt.class));
        verify(receiptAssets).saveAllAndFlush(any());
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
