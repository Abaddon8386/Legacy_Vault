package com.legacyvault.verification;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.dto.HandoverSessionStatusRequest;
import com.legacyvault.verification.entity.HandoverSession;
import com.legacyvault.verification.entity.HandoverSessionStatus;
import com.legacyvault.verification.repository.HandoverSessionRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.HandoverSessionCaseAccess;
import com.legacyvault.verification.service.HandoverSessionService;
import com.legacyvault.verification.service.LegalWorkflowGuard;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.entity.VerificationCase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class HandoverSessionServiceTest {
    private static final UUID CASE_ID = UUID.randomUUID();
    private static final UUID SESSION_ID = UUID.randomUUID();
    private static final UUID VAULT_PUBLIC_ID = UUID.randomUUID();
    private static final UUID STAFF_PUBLIC_ID = UUID.randomUUID();
    private static final CustomUserPrincipal STAFF = new CustomUserPrincipal(33L, STAFF_PUBLIC_ID, "staff@example.test");

    private final HandoverSessionCaseAccess access = mock(HandoverSessionCaseAccess.class);
    private final VerificationCaseRepository cases = mock(VerificationCaseRepository.class);
    private final HandoverSessionRepository sessions = mock(HandoverSessionRepository.class);
    private final VaultRepository vaults = mock(VaultRepository.class);
    private final AuditService audit = mock(AuditService.class);
    private final LegalWorkflowGuard workflow = mock(LegalWorkflowGuard.class);
    private final HandoverSessionService service = new HandoverSessionService(access, cases, sessions, vaults, audit, workflow);
    private final VerificationCase verificationCase = mock(VerificationCase.class);
    private final Vault vault = mock(Vault.class);
    private final HandoverSession session = mock(HandoverSession.class);

    @BeforeEach
    void setUp() {
        when(access.lockByPublicCaseId(CASE_ID, STAFF.userId()))
                .thenReturn(new HandoverSessionCaseAccess.LockedCase(vault, verificationCase));
        when(access.lock(91L, STAFF.userId()))
                .thenReturn(new HandoverSessionCaseAccess.LockedCase(vault, verificationCase));
        when(verificationCase.getVerificationCaseId()).thenReturn(91L);
        when(verificationCase.getPublicId()).thenReturn(CASE_ID);
        when(verificationCase.getVaultId()).thenReturn(92L);
        when(verificationCase.isOpen()).thenReturn(true);
        when(vault.getVaultId()).thenReturn(92L);
        when(vault.getPublicId()).thenReturn(VAULT_PUBLIC_ID);
        when(vault.getStatus()).thenReturn(Vault.STATUS_UNLOCKED);
        when(session.getId()).thenReturn(101L);
        when(session.getPublicId()).thenReturn(SESSION_ID);
        when(session.getVerificationCaseId()).thenReturn(91L);
        when(session.getStaffUserId()).thenReturn(STAFF.userId());
        when(session.getStatus()).thenReturn(HandoverSessionStatus.OPEN, HandoverSessionStatus.CANCELLED);
        when(session.getOpenedAt()).thenReturn(LocalDateTime.parse("2026-10-18T10:00:00"));
        when(session.getClosedAt()).thenReturn(null, LocalDateTime.parse("2026-10-18T11:00:00"));
        when(sessions.saveAndFlush(any(HandoverSession.class))).thenReturn(session);
    }

    @Test
    void openCreatesStaffScopedSessionAndAudits() {
        var response = service.open(CASE_ID, STAFF);
        assertThat(response.sessionId()).isEqualTo(SESSION_ID);
        assertThat(response.caseId()).isEqualTo(CASE_ID);
        assertThat(response.vaultId()).isEqualTo(VAULT_PUBLIC_ID);
        assertThat(response.staffId()).isEqualTo(STAFF_PUBLIC_ID);
        assertThat(response.status()).isEqualTo(HandoverSessionStatus.OPEN);
        verify(sessions).saveAndFlush(any(HandoverSession.class));
        verify(workflow).requireProtectedTransition(CASE_ID, LegalWorkflowGuard.ProtectedTransition.HANDOVER);
        ArgumentCaptor<AuditEvent> event = ArgumentCaptor.forClass(AuditEvent.class);
        verify(audit).record(event.capture());
        assertThat(event.getValue().action()).isEqualTo(AuditAction.HANDOVER_SESSION_OPENED);
        assertThat(event.getValue().context()).doesNotContainKey("documentContent");
    }

    @Test
    void cannotOpenForUnassignedStaffOrInvalidCaseOrVaultState() {
        doThrow(new BusinessException(ErrorCode.RESOURCE_NOT_FOUND))
                .when(access).lockByPublicCaseId(CASE_ID, STAFF.userId());
        assertThatThrownBy(() -> service.open(CASE_ID, STAFF))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
        verifyNoInteractions(sessions, audit);

        reset(access, sessions, audit);
        when(access.lockByPublicCaseId(CASE_ID, STAFF.userId()))
                .thenReturn(new HandoverSessionCaseAccess.LockedCase(vault, verificationCase));
        when(verificationCase.isOpen()).thenReturn(false);
        assertInvalidOpen();

        when(verificationCase.isOpen()).thenReturn(true);
        when(vault.getStatus()).thenReturn(Vault.STATUS_ACTIVE);
        assertInvalidOpen();
    }

    @Test
    void duplicateOpenSessionIsRejected() {
        when(sessions.existsByVerificationCaseIdAndStatus(91L, HandoverSessionStatus.OPEN)).thenReturn(true);

        assertThatThrownBy(() -> service.open(CASE_ID, STAFF))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.HANDOVER_SESSION_ALREADY_OPEN);
        verify(sessions, never()).saveAndFlush(any());
        verifyNoInteractions(audit);
    }

    @Test
    void legalHoldOrStaleApprovalBlocksSessionOpen() {
        doThrow(new BusinessException(ErrorCode.LEGAL_WORKFLOW_ON_HOLD))
                .when(workflow).requireProtectedTransition(CASE_ID, LegalWorkflowGuard.ProtectedTransition.HANDOVER);

        assertThatThrownBy(() -> service.open(CASE_ID, STAFF))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.LEGAL_WORKFLOW_ON_HOLD);
        verifyNoInteractions(sessions, audit);
    }

    @Test
    void statusUpdateCancelsAnOpenSessionAndAudits() {
        when(cases.findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF.userId())).thenReturn(Optional.of(verificationCase));
        when(sessions.findByPublicIdAndVerificationCaseIdAndStaffUserId(SESSION_ID, 91L, STAFF.userId()))
                .thenReturn(Optional.of(session));
        when(sessions.findByPublicIdAndCaseAndStaffForUpdate(SESSION_ID, 91L, STAFF.userId()))
                .thenReturn(Optional.of(session));

        var result = service.updateStatus(CASE_ID, SESSION_ID,
                new HandoverSessionStatusRequest(HandoverSessionStatusRequest.TerminalStatus.CANCELLED), STAFF);

        assertThat(result.status()).isEqualTo(HandoverSessionStatus.CANCELLED);
        verify(session).close(eq(HandoverSessionStatus.CANCELLED), any(LocalDateTime.class));
        ArgumentCaptor<AuditEvent> event = ArgumentCaptor.forClass(AuditEvent.class);
        verify(audit).record(event.capture());
        assertThat(event.getValue().action()).isEqualTo(AuditAction.HANDOVER_SESSION_CANCELLED);
        assertThat(event.getValue().stateBefore()).isEqualTo("OPEN");
        assertThat(event.getValue().stateAfter()).isEqualTo("CANCELLED");
    }

    @Test
    void auditFailurePropagatesAndPreventsSuccessfulStatusResponse() {
        when(cases.findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF.userId())).thenReturn(Optional.of(verificationCase));
        when(sessions.findByPublicIdAndVerificationCaseIdAndStaffUserId(SESSION_ID, 91L, STAFF.userId()))
                .thenReturn(Optional.of(session));
        when(sessions.findByPublicIdAndCaseAndStaffForUpdate(SESSION_ID, 91L, STAFF.userId()))
                .thenReturn(Optional.of(session));
        doThrow(new IllegalStateException("audit unavailable")).when(audit).record(any(AuditEvent.class));

        assertThatThrownBy(() -> service.updateStatus(CASE_ID, SESSION_ID,
                new HandoverSessionStatusRequest(HandoverSessionStatusRequest.TerminalStatus.CANCELLED), STAFF))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("audit unavailable");
        verify(sessions).saveAndFlush(session);
    }

    @Test
    void detailAndStatusQueryAreScopedToAssignedStaff() {
        when(cases.findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF.userId())).thenReturn(Optional.of(verificationCase));
        when(vaults.findById(92L)).thenReturn(Optional.of(vault));
        when(sessions.findByPublicIdAndVerificationCaseIdAndStaffUserId(SESSION_ID, 91L, STAFF.userId()))
                .thenReturn(Optional.of(session));
        when(sessions.findByVerificationCaseIdAndStaffUserIdAndStatusOrderByOpenedAtDesc(
                91L, STAFF.userId(), HandoverSessionStatus.OPEN)).thenReturn(List.of(session));

        assertThat(service.get(CASE_ID, SESSION_ID, STAFF).sessionId()).isEqualTo(SESSION_ID);
        assertThat(service.list(CASE_ID, HandoverSessionStatus.OPEN, STAFF)).hasSize(1);
        verify(cases, times(2)).findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF.userId());
    }

    @Test
    void unauthenticatedPrincipalIsRejectedBeforeDataAccess() {
        assertThatThrownBy(() -> service.open(CASE_ID, null))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.UNAUTHENTICATED);
        verifyNoInteractions(access, cases, sessions, vaults, audit);
    }

    private void assertInvalidOpen() {
        assertThatThrownBy(() -> service.open(CASE_ID, STAFF))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.HANDOVER_SESSION_INVALID_STATE);
        verifyNoInteractions(sessions, audit);
    }
}
