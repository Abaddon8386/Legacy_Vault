package com.legacyvault.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.verification.entity.HandoverSession;
import com.legacyvault.verification.entity.HandoverSessionStatus;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.HandoverSessionRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.HandoverAuthorizationGuard;
import com.legacyvault.verification.service.LegalBasisCaseAccess;
import com.legacyvault.verification.service.LegalWorkflowGuard;
import com.legacyvault.verification.service.LegalWorkflowGuard.ProtectedTransition;

/** PS-66 (ST-25, LV-HANDOVER-001): every condition of the central handover gate blocks on its own. */
class HandoverAuthorizationGuardTest {

    private static final Long STAFF_ID = 7L;
    private static final Long CASE_DB_ID = 500L;
    private static final Long DOSSIER_ID = 900L;
    private static final UUID CASE_ID = UUID.randomUUID();
    private static final UUID SESSION_ID = UUID.randomUUID();

    private final VerificationCaseRepository cases = mock(VerificationCaseRepository.class);
    private final LegalWorkflowGuard workflow = mock(LegalWorkflowGuard.class);
    private final HandoverSessionRepository sessions = mock(HandoverSessionRepository.class);
    private final LegalBasisDossierVersionRepository versions = mock(LegalBasisDossierVersionRepository.class);
    private final HandoverAuthorizationGuard guard = new HandoverAuthorizationGuard(cases, workflow, sessions, versions);

    private final VerificationCase verificationCase = mock(VerificationCase.class);
    private final Vault vault = mock(Vault.class);
    private final LegalBasisDossier dossier = mock(LegalBasisDossier.class);
    private final HandoverSession session = mock(HandoverSession.class);

    HandoverAuthorizationGuardTest() {
        when(verificationCase.getVerificationCaseId()).thenReturn(CASE_DB_ID);
        when(verificationCase.getAssignedStaffUserId()).thenReturn(STAFF_ID);
        when(dossier.getLegalBasisDossierId()).thenReturn(DOSSIER_ID);
        when(vault.getStatus()).thenReturn(Vault.STATUS_UNLOCKED);
        when(session.getStatus()).thenReturn(HandoverSessionStatus.OPEN);
        when(cases.findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF_ID)).thenReturn(Optional.of(verificationCase));
        when(workflow.requireProtectedTransition(CASE_ID, ProtectedTransition.HANDOVER))
                .thenReturn(new LegalBasisCaseAccess.LockedCase(vault, verificationCase, dossier));
        when(sessions.findByPublicIdAndCaseAndStaffForUpdate(SESSION_ID, CASE_DB_ID, STAFF_ID))
                .thenReturn(Optional.of(session));
        when(versions.findMaxVersionNo(DOSSIER_ID)).thenReturn(3);
    }

    private ErrorCode blockedWith() {
        try {
            guard.authorize(CASE_ID, SESSION_ID, STAFF_ID);
        } catch (BusinessException ex) {
            return ex.getErrorCode();
        }
        throw new AssertionError("The guard should have blocked");
    }

    @Test
    void allConditionsMet_returnsLockedContextAtTheApprovedVersion() {
        var authorized = guard.authorize(CASE_ID, SESSION_ID, STAFF_ID);

        assertThat(authorized.versionNo()).isEqualTo(3);
        assertThat(authorized.vault()).isSameAs(vault);
        assertThat(authorized.session()).isSameAs(session);
        verify(workflow).requireProtectedTransition(CASE_ID, ProtectedTransition.HANDOVER);
    }

    @Test
    void handoverInProgressVaultIsStillAllowed() {
        when(vault.getStatus()).thenReturn(Vault.STATUS_HANDOVER_IN_PROGRESS);

        assertThat(guard.authorize(CASE_ID, SESSION_ID, STAFF_ID).versionNo()).isEqualTo(3);
    }

    @Test
    void caseNotOwnedByStaff_isNotFound_andNoLockIsTaken() {
        when(cases.findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF_ID)).thenReturn(Optional.empty());

        assertThat(blockedWith()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
        verifyNoInteractions(workflow, sessions);
    }

    @Test
    void legalGateFailuresPropagate_beforeAnySessionIsTouched() {
        for (ErrorCode code : List.of(ErrorCode.LEGAL_WORKFLOW_ON_HOLD, ErrorCode.LEGAL_DECISION_STALE,
                ErrorCode.LEGAL_APPROVAL_REQUIRED, ErrorCode.COURT_DECISION_REQUIRED,
                ErrorCode.BASIS_DOSSIER_INVALID_STATE)) {
            org.mockito.Mockito.doThrow(new BusinessException(code)).when(workflow)
                    .requireProtectedTransition(CASE_ID, ProtectedTransition.HANDOVER);
            assertThat(blockedWith()).isEqualTo(code);
        }
        verifyNoInteractions(sessions);
    }

    @Test
    void vaultThatIsNotUnlocked_isBlocked() {
        for (String status : List.of(Vault.STATUS_LEGAL_BASIS_VERIFICATION, Vault.STATUS_ON_HOLD, "ARCHIVED", "ACTIVE")) {
            when(vault.getStatus()).thenReturn(status);
            assertThat(blockedWith()).isEqualTo(ErrorCode.HANDOVER_VAULT_NOT_UNLOCKED);
        }
        verifyNoInteractions(sessions);
    }

    @Test
    void missingOrForeignSession_isNotFound() {
        when(sessions.findByPublicIdAndCaseAndStaffForUpdate(eq(SESSION_ID), any(), any()))
                .thenReturn(Optional.empty());

        assertThat(blockedWith()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
    }

    @Test
    void closedSession_isBlocked() {
        for (HandoverSessionStatus status : List.of(HandoverSessionStatus.COMPLETED, HandoverSessionStatus.CANCELLED)) {
            when(session.getStatus()).thenReturn(status);
            assertThat(blockedWith()).isEqualTo(ErrorCode.HANDOVER_SESSION_INVALID_STATE);
        }
    }

    @Test
    void lockedCaseThatDiffersFromTheOwnedCase_isNotFound() {
        VerificationCase other = mock(VerificationCase.class);
        when(other.getVerificationCaseId()).thenReturn(CASE_DB_ID + 1);
        when(other.getAssignedStaffUserId()).thenReturn(STAFF_ID);
        when(workflow.requireProtectedTransition(CASE_ID, ProtectedTransition.HANDOVER))
                .thenReturn(new LegalBasisCaseAccess.LockedCase(vault, other, dossier));

        assertThat(blockedWith()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);

        VerificationCase reassigned = mock(VerificationCase.class);
        when(reassigned.getVerificationCaseId()).thenReturn(CASE_DB_ID);
        when(reassigned.getAssignedStaffUserId()).thenReturn(STAFF_ID + 1);
        when(workflow.requireProtectedTransition(CASE_ID, ProtectedTransition.HANDOVER))
                .thenReturn(new LegalBasisCaseAccess.LockedCase(vault, reassigned, dossier));
        assertThat(blockedWith()).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND);
    }
}
