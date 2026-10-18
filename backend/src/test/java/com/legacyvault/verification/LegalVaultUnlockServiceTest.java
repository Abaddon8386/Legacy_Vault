package com.legacyvault.verification;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.service.LegalBasisCaseAccess;
import com.legacyvault.verification.service.LegalWorkflowGuard;
import com.legacyvault.verification.service.LegalVaultUnlockService;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class LegalVaultUnlockServiceTest {
    private static final UUID CASE_ID = UUID.randomUUID();
    private static final UUID CASE_PUBLIC_ID = UUID.randomUUID();
    private static final UUID VAULT_PUBLIC_ID = UUID.randomUUID();
    private static final UUID ACTOR_PUBLIC_ID = UUID.randomUUID();
    private static final CustomUserPrincipal LEGAL = new CustomUserPrincipal(25L, ACTOR_PUBLIC_ID, "legal@example.test");

    private final LegalWorkflowGuard workflow = mock(LegalWorkflowGuard.class);
    private final VaultRepository vaults = mock(VaultRepository.class);
    private final AuditService audit = mock(AuditService.class);
    private final LegalVaultUnlockService service = new LegalVaultUnlockService(workflow, vaults, audit);
    private final Vault vault = mock(Vault.class);
    private final VerificationCase verificationCase = mock(VerificationCase.class);

    @BeforeEach
    void setUp() {
        when(workflow.requireProtectedTransition(CASE_ID, LegalWorkflowGuard.ProtectedTransition.UNLOCK))
                .thenReturn(new LegalBasisCaseAccess.LockedCase(vault, verificationCase, null));
        when(vault.getStatus()).thenReturn(Vault.STATUS_LEGAL_BASIS_VERIFICATION, Vault.STATUS_UNLOCKED);
        when(vault.getVaultId()).thenReturn(91L);
        when(vault.getPublicId()).thenReturn(VAULT_PUBLIC_ID);
        when(verificationCase.getPublicId()).thenReturn(CASE_PUBLIC_ID);
        when(vaults.saveAndFlush(vault)).thenReturn(vault);
    }

    @Test
    void unlockRequiresWorkflowApprovalThenPersistsAndAudits() {
        var response = service.unlock(CASE_ID, LEGAL);

        assertThat(response.status()).isEqualTo(Vault.STATUS_UNLOCKED);
        assertThat(response.caseId()).isEqualTo(CASE_PUBLIC_ID);
        assertThat(response.unlockedBy()).isEqualTo(ACTOR_PUBLIC_ID);
        verify(vault).unlockAfterLegalApproval();
        InOrder order = inOrder(workflow, vault, vaults, audit);
        order.verify(workflow).requireProtectedTransition(CASE_ID, LegalWorkflowGuard.ProtectedTransition.UNLOCK);
        order.verify(vault).unlockAfterLegalApproval();
        order.verify(vaults).saveAndFlush(vault);
        order.verify(audit).record(any(AuditEvent.class));
        var event = org.mockito.ArgumentCaptor.forClass(AuditEvent.class);
        verify(audit).record(event.capture());
        assertThat(event.getValue().action()).isEqualTo(AuditAction.LEGAL_VAULT_UNLOCKED);
        assertThat(event.getValue().stateAfter()).isEqualTo(Vault.STATUS_UNLOCKED);
    }

    @Test
    void missingOrStaleApprovalPreventsMutationAndAudit() {
        doThrow(new BusinessException(ErrorCode.LEGAL_DECISION_STALE))
                .when(workflow).requireProtectedTransition(CASE_ID, LegalWorkflowGuard.ProtectedTransition.UNLOCK);

        assertThatThrownBy(() -> service.unlock(CASE_ID, LEGAL))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.LEGAL_DECISION_STALE);
        verifyNoInteractions(vaults, audit);
        verify(vault, never()).unlockAfterLegalApproval();
    }

    @Test
    void auditFailurePropagatesAfterStateFlushForTransactionalRollback() {
        doThrow(new IllegalStateException("audit unavailable")).when(audit).record(any(AuditEvent.class));

        assertThatThrownBy(() -> service.unlock(CASE_ID, LEGAL))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("audit unavailable");
        verify(vaults).saveAndFlush(vault);
        verify(audit).record(any(AuditEvent.class));
    }

    @Test
    void unauthenticatedPrincipalRejectedBeforeUnlock() {
        assertThatThrownBy(() -> service.unlock(CASE_ID, null))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.UNAUTHENTICATED);
        verifyNoInteractions(workflow, vaults, audit);
    }
}
