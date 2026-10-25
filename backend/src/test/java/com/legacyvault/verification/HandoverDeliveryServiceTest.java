package com.legacyvault.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyIterable;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.util.ReflectionTestUtils;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.verification.dto.EligibleHandoverAssetResponse;
import com.legacyvault.verification.dto.HandoverDeliveryRequest;
import com.legacyvault.verification.entity.HandoverItem;
import com.legacyvault.verification.entity.HandoverSession;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.HandoverItemRepository;
import com.legacyvault.verification.repository.HandoverItemRow;
import com.legacyvault.verification.repository.HandoverSessionRepository;
import com.legacyvault.verification.repository.ReceiptAllocationRow;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.HandoverAuthorizationGuard;
import com.legacyvault.verification.service.HandoverAuthorizationGuard.Authorized;
import com.legacyvault.verification.service.HandoverDeliveryService;
import com.legacyvault.verification.service.HandoverScopeResolver;
import com.legacyvault.verification.service.HandoverScopeResolver.ScopeLine;

/** PS-64 / PS-65 (ST-25, LV-HANDOVER-001): record deliveries only inside the approved scope, atomically and audited. */
class HandoverDeliveryServiceTest {

    private static final Long STAFF_ID = 7L;
    private static final Long VAULT_ID = 9L;
    private static final Long SESSION_DB_ID = 300L;
    private static final Long DOSSIER_ID = 900L;
    private static final UUID CASE_ID = UUID.randomUUID();
    private static final UUID SESSION_ID = UUID.randomUUID();
    private static final UUID RECIPIENT = UUID.randomUUID();
    private static final UUID STAFF_PUBLIC = UUID.randomUUID();
    private static final UUID ASSET_A = UUID.randomUUID();
    private static final UUID ASSET_B = UUID.randomUUID();

    private final HandoverAuthorizationGuard guard = mock(HandoverAuthorizationGuard.class);
    private final HandoverScopeResolver scope = mock(HandoverScopeResolver.class);
    private final HandoverItemRepository items = mock(HandoverItemRepository.class);
    private final HandoverSessionRepository sessions = mock(HandoverSessionRepository.class);
    private final VerificationCaseRepository cases = mock(VerificationCaseRepository.class);
    private final AuditService audit = mock(AuditService.class);
    private final HandoverDeliveryService service = new HandoverDeliveryService(guard, scope, items, sessions, cases, audit, true);

    private final CustomUserPrincipal staff = new CustomUserPrincipal(STAFF_ID, STAFF_PUBLIC, "staff@example.com");
    private final Vault vault = mock(Vault.class);
    private final HandoverSession session = mock(HandoverSession.class);

    HandoverDeliveryServiceTest() {
        LegalBasisDossier dossier = mock(LegalBasisDossier.class);
        when(dossier.getLegalBasisDossierId()).thenReturn(DOSSIER_ID);
        when(vault.getVaultId()).thenReturn(VAULT_ID);
        when(vault.getStatus()).thenReturn(Vault.STATUS_UNLOCKED, Vault.STATUS_HANDOVER_IN_PROGRESS);
        when(session.getId()).thenReturn(SESSION_DB_ID);
        when(guard.authorize(CASE_ID, SESSION_ID, STAFF_ID))
                .thenReturn(new Authorized(vault, mock(VerificationCase.class), dossier, session, 2));
    }

    private static ScopeLine line(long allocationId, UUID asset, boolean delivered) {
        return new ScopeLine(new ReceiptAllocationRow(2, allocationId, allocationId + 100, asset, 11L, RECIPIENT,
                "VERIFIED_AT_COUNTER", "APPROVED", "note"), delivered);
    }

    private void scopeLines(ScopeLine... lines) {
        when(scope.resolve(DOSSIER_ID, 2, RECIPIENT)).thenReturn(List.of(lines));
    }

    private static BusinessException expect(Runnable action) {
        try {
            action.run();
        } catch (BusinessException ex) {
            return ex;
        }
        throw new AssertionError("BusinessException expected");
    }

    @Test
    void deliveryIsRecordedForApprovedAssets_movesVaultToHandoverInProgress_andAudits() {
        scopeLines(line(1, ASSET_A, false), line(2, ASSET_B, false));
        when(items.saveAllAndFlush(anyIterable())).thenAnswer(invocation -> {
            List<HandoverItem> saved = ((Iterable<HandoverItem>) invocation.getArgument(0)) instanceof List<HandoverItem> list
                    ? list : List.of();
            saved.forEach(item -> ReflectionTestUtils.setField(item, "publicId", UUID.randomUUID()));
            return saved;
        });
        when(items.findRowsBySession(SESSION_DB_ID)).thenAnswer(invocation -> {
            ArgumentCaptor<Iterable<HandoverItem>> captured = ArgumentCaptor.forClass(Iterable.class);
            verify(items).saveAllAndFlush(captured.capture());
            List<HandoverItemRow> rows = new java.util.ArrayList<>();
            for (HandoverItem item : captured.getValue()) {
                rows.add(new HandoverItemRow(item.getPublicId(), SESSION_ID,
                        item.getAssetId().equals(101L) ? ASSET_A : ASSET_B, RECIPIENT, "DELIVERED",
                        LocalDateTime.of(2026, 10, 18, 9, 0), STAFF_PUBLIC));
            }
            return rows;
        });

        var response = service.deliver(CASE_ID, SESSION_ID, new HandoverDeliveryRequest(RECIPIENT,
                List.of(ASSET_A, ASSET_B)), staff);

        assertThat(response).hasSize(2);
        assertThat(response).extracting(r -> r.status()).containsOnly("DELIVERED");
        assertThat(response).extracting(r -> r.recipientId()).containsOnly(RECIPIENT);
        ArgumentCaptor<Iterable<HandoverItem>> saved = ArgumentCaptor.forClass(Iterable.class);
        verify(items).saveAllAndFlush(saved.capture());
        for (HandoverItem item : saved.getValue()) {
            assertThat(item.getHandoverSessionId()).isEqualTo(SESSION_DB_ID);
            assertThat(item.getDeliveredByStaffUserId()).isEqualTo(STAFF_ID);
            assertThat(item.getBeneficiaryId()).isEqualTo(11L);
        }
        verify(vault).markHandoverInProgress();

        ArgumentCaptor<AuditEvent> event = ArgumentCaptor.forClass(AuditEvent.class);
        verify(audit).record(event.capture());
        assertThat(event.getValue().action()).isEqualTo(AuditAction.HANDOVER_ASSET_DELIVERED);
        assertThat(event.getValue().stepId()).isEqualTo("ST-25");
        assertThat(event.getValue().ruleId()).isEqualTo("LV-HANDOVER-001");
        assertThat(event.getValue().vaultId()).isEqualTo(VAULT_ID);
        assertThat(event.getValue().context()).containsEntry("assetCount", 2)
                .containsEntry("recipientPublicId", RECIPIENT.toString());
        assertThat(event.getValue().context().toString()).doesNotContain("note", "example.com");
    }

    @Test
    void assetOutsideTheApprovedScopeIsRejected_andNothingIsSaved() {
        scopeLines(line(1, ASSET_A, false));

        BusinessException ex = expect(() -> service.deliver(CASE_ID, SESSION_ID,
                new HandoverDeliveryRequest(RECIPIENT, List.of(ASSET_A, UUID.randomUUID())), staff));

        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.HANDOVER_ASSET_NOT_ELIGIBLE);
        verify(items, never()).saveAllAndFlush(anyIterable());
        verify(vault, never()).markHandoverInProgress();
        verifyNoInteractions(audit);
    }

    @Test
    void alreadyDeliveredAssetIsRejected_evenWhenOtherAssetsAreFine() {
        scopeLines(line(1, ASSET_A, true), line(2, ASSET_B, false));

        BusinessException ex = expect(() -> service.deliver(CASE_ID, SESSION_ID,
                new HandoverDeliveryRequest(RECIPIENT, List.of(ASSET_A, ASSET_B)), staff));

        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.HANDOVER_ASSET_ALREADY_DELIVERED);
        verify(items, never()).saveAllAndFlush(anyIterable());
        verifyNoInteractions(audit);
    }

    @Test
    void concurrentDoubleDeliveryMapsToConflict_withoutAuditOrVaultChange() {
        scopeLines(line(1, ASSET_A, false));
        when(items.saveAllAndFlush(anyIterable())).thenThrow(new DataIntegrityViolationException("duplicate"));

        BusinessException ex = expect(() -> service.deliver(CASE_ID, SESSION_ID,
                new HandoverDeliveryRequest(RECIPIENT, List.of(ASSET_A)), staff));

        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.HANDOVER_ASSET_ALREADY_DELIVERED);
        verify(vault, never()).markHandoverInProgress();
        verifyNoInteractions(audit);
    }

    @Test
    void recipientNotEligible_propagatesFromTheScope() {
        when(scope.resolve(DOSSIER_ID, 2, RECIPIENT)).thenThrow(new BusinessException(ErrorCode.HANDOVER_RECIPIENT_NOT_ELIGIBLE));

        BusinessException ex = expect(() -> service.deliver(CASE_ID, SESSION_ID,
                new HandoverDeliveryRequest(RECIPIENT, List.of(ASSET_A)), staff));

        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.HANDOVER_RECIPIENT_NOT_ELIGIBLE);
        verify(items, never()).saveAllAndFlush(anyIterable());
    }

    @Test
    void invalidRequestStopsBeforeTheGuardIsEvenCalled() {
        assertThat(expect(() -> service.deliver(CASE_ID, SESSION_ID,
                new HandoverDeliveryRequest(RECIPIENT, List.of(ASSET_A, ASSET_A)), staff)).getErrorCode())
                .isEqualTo(ErrorCode.VALIDATION_FAILED);
        assertThat(expect(() -> service.deliver(CASE_ID, SESSION_ID,
                new HandoverDeliveryRequest(RECIPIENT, List.of()), staff)).getErrorCode())
                .isEqualTo(ErrorCode.VALIDATION_FAILED);
        assertThat(expect(() -> service.deliver(CASE_ID, SESSION_ID, null, staff)).getErrorCode())
                .isEqualTo(ErrorCode.VALIDATION_FAILED);
        verifyNoInteractions(guard, scope, items);
    }

    @Test
    void guardFailureBlocksEveryOperation() {
        when(guard.authorize(CASE_ID, SESSION_ID, STAFF_ID))
                .thenThrow(new BusinessException(ErrorCode.LEGAL_WORKFLOW_ON_HOLD));

        assertThat(expect(() -> service.deliver(CASE_ID, SESSION_ID,
                new HandoverDeliveryRequest(RECIPIENT, List.of(ASSET_A)), staff)).getErrorCode())
                .isEqualTo(ErrorCode.LEGAL_WORKFLOW_ON_HOLD);
        assertThat(expect(() -> service.eligibleAssets(CASE_ID, SESSION_ID, null, staff)).getErrorCode())
                .isEqualTo(ErrorCode.LEGAL_WORKFLOW_ON_HOLD);
        verifyNoInteractions(scope, items, audit);
    }

    @Test
    void eligibleAssetsReportDeliveryStatus_withoutInternalIds() {
        when(scope.resolve(DOSSIER_ID, 2, null)).thenReturn(List.of(line(1, ASSET_A, false), line(2, ASSET_B, true)));

        var result = service.eligibleAssets(CASE_ID, SESSION_ID, null, staff);

        assertThat(result).extracting(EligibleHandoverAssetResponse::assetId).containsExactly(ASSET_A, ASSET_B);
        assertThat(result).extracting(EligibleHandoverAssetResponse::deliveryStatus)
                .containsExactly(EligibleHandoverAssetResponse.ELIGIBLE, EligibleHandoverAssetResponse.DELIVERED);
        assertThat(result).extracting(EligibleHandoverAssetResponse::recipientId).containsOnly(RECIPIENT);
    }

    private static ScopeLine unlinkedCourtLine(long allocationId, UUID asset) {
        return new ScopeLine(new ReceiptAllocationRow(2, allocationId, allocationId + 100, asset, 12L, RECIPIENT,
                "VERIFIED_AT_COUNTER", "APPROVED", "note", "Asset", "Recipient C", null, "COURT_DOCUMENT"), false);
    }

    /** BE-02 (LV-HANDOVER-001): no new delivery before the recipient's own official account is linked. */
    @Test
    void recipientWithoutLinkedAccountIsRejected_andNothingIsSavedOrAudited() {
        scopeLines(unlinkedCourtLine(1, ASSET_A), line(2, ASSET_B, false));

        BusinessException ex = expect(() -> service.deliver(CASE_ID, SESSION_ID,
                new HandoverDeliveryRequest(RECIPIENT, List.of(ASSET_A)), staff));

        assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.HANDOVER_RECIPIENT_ACCOUNT_REQUIRED);
        verify(items, never()).saveAllAndFlush(anyIterable());
        verify(vault, never()).markHandoverInProgress();
        verifyNoInteractions(audit);
    }

    @Test
    void eligibleAssetsExplainWhyAnUnlinkedRecipientCannotReceiveYet() {
        when(scope.resolve(DOSSIER_ID, 2, null))
                .thenReturn(List.of(unlinkedCourtLine(1, ASSET_A), line(2, ASSET_B, false)));

        var result = service.eligibleAssets(CASE_ID, SESSION_ID, null, staff);

        assertThat(result).extracting(EligibleHandoverAssetResponse::deliverable).containsExactly(false, true);
        assertThat(result).extracting(EligibleHandoverAssetResponse::blockedReason)
                .containsExactly(EligibleHandoverAssetResponse.BLOCKED_ACCOUNT_REQUIRED, null);
        assertThat(result).extracting(EligibleHandoverAssetResponse::recipientSource)
                .containsExactly("COURT_DOCUMENT", "OWNER_DESIGNATED");
        assertThat(result).extracting(EligibleHandoverAssetResponse::accountLinked).containsExactly(false, true);
    }

    @Test
    void flagOffRestoresTheOfflineRecipientBehaviour() {
        HandoverDeliveryService lenient = new HandoverDeliveryService(guard, scope, items, sessions, cases, audit, false);
        scopeLines(unlinkedCourtLine(1, ASSET_A));
        when(items.saveAllAndFlush(anyIterable())).thenAnswer(invocation -> {
            List<HandoverItem> saved = (List<HandoverItem>) invocation.getArgument(0);
            saved.forEach(item -> ReflectionTestUtils.setField(item, "publicId", UUID.randomUUID()));
            return saved;
        });
        when(items.findRowsBySession(SESSION_DB_ID)).thenReturn(List.of());

        lenient.deliver(CASE_ID, SESSION_ID, new HandoverDeliveryRequest(RECIPIENT, List.of(ASSET_A)), staff);

        verify(items).saveAllAndFlush(anyIterable());
    }

    @Test
    void listIsHiddenFromStaffWhoDoNotOwnTheCaseOrSession() {
        when(cases.findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF_ID)).thenReturn(Optional.empty());
        assertThat(expect(() -> service.list(CASE_ID, SESSION_ID, staff)).getErrorCode())
                .isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);

        VerificationCase owned = mock(VerificationCase.class);
        when(owned.getVerificationCaseId()).thenReturn(500L);
        when(cases.findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF_ID)).thenReturn(Optional.of(owned));
        when(sessions.findByPublicIdAndVerificationCaseIdAndStaffUserId(eq(SESSION_ID), eq(500L), eq(STAFF_ID)))
                .thenReturn(Optional.empty());
        assertThat(expect(() -> service.list(CASE_ID, SESSION_ID, staff)).getErrorCode())
                .isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);

        when(sessions.findByPublicIdAndVerificationCaseIdAndStaffUserId(eq(SESSION_ID), eq(500L), eq(STAFF_ID)))
                .thenReturn(Optional.of(session));
        when(items.findRowsBySession(SESSION_DB_ID)).thenReturn(List.of(new HandoverItemRow(UUID.randomUUID(), SESSION_ID,
                ASSET_A, RECIPIENT, "DELIVERED", LocalDateTime.of(2026, 10, 18, 9, 0), STAFF_PUBLIC)));
        assertThat(service.list(CASE_ID, SESSION_ID, staff)).hasSize(1);
        verify(guard, never()).authorize(any(), any(), any());
    }
}
