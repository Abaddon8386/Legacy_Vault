package com.legacyvault.verification;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.CourtEvidenceVersion;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.service.CourtRouteGuard;
import com.legacyvault.verification.service.LegalApprovalGuard;
import com.legacyvault.verification.service.LegalBasisCaseAccess;
import com.legacyvault.verification.service.LegalWorkflowGuard;
import com.legacyvault.vault.entity.Vault;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LegalWorkflowGuardTest {
    private static final UUID CASE_ID = UUID.randomUUID();
    private static final Long DOSSIER_ID = 50L;
    private static final int VERSION = 3;
    private static final Long VERSION_ID = 70L;

    private final LegalBasisCaseAccess access = mock(LegalBasisCaseAccess.class);
    private final CourtRouteGuard court = mock(CourtRouteGuard.class);
    private final LegalBasisDossierVersionRepository versions = mock(LegalBasisDossierVersionRepository.class);
    private final LegalApprovalGuard approvals = mock(LegalApprovalGuard.class);
    private final LegalWorkflowGuard guard = new LegalWorkflowGuard(access, court, versions, approvals);
    private final LegalBasisDossier dossier = mock(LegalBasisDossier.class);
    private final VerificationCase verificationCase = mock(VerificationCase.class);
    private final Vault vault = mock(Vault.class);
    private final CourtEvidenceVersion current = new CourtEvidenceVersion(VERSION_ID, VERSION, "a".repeat(64),
            "COURT_JUDGMENT", "Authority", "DOC", null, "FORWARDED", true);

    @BeforeEach
    void setUp() {
        when(access.lock(CASE_ID)).thenReturn(new LegalBasisCaseAccess.LockedCase(vault, verificationCase, dossier));
        when(verificationCase.isOpen()).thenReturn(true);
        when(vault.getStatus()).thenReturn(Vault.STATUS_LEGAL_BASIS_VERIFICATION);
        when(dossier.acceptsIntake()).thenReturn(true);
        when(dossier.getRoute()).thenReturn(LegalBasisDossier.ROUTE_COURT);
        when(dossier.getStatus()).thenReturn(LegalBasisDossier.STATUS_FORWARDED);
        when(dossier.getRequiredVersionNo()).thenReturn(1);
        when(dossier.getLegalBasisDossierId()).thenReturn(DOSSIER_ID);
        when(versions.findMaxVersionNo(DOSSIER_ID)).thenReturn(VERSION);
        when(versions.findCourtEvidence(DOSSIER_ID, VERSION)).thenReturn(Optional.of(current));
    }

    @Test
    void allProtectedTransitionsRequireCurrentLegalApproval() {
        for (LegalWorkflowGuard.ProtectedTransition transition : LegalWorkflowGuard.ProtectedTransition.values()) {
            guard.requireProtectedTransition(CASE_ID, transition);
        }
        for (LegalWorkflowGuard.ProtectedTransition transition : LegalWorkflowGuard.ProtectedTransition.values()) {
        }
        verify(approvals, times(LegalWorkflowGuard.ProtectedTransition.values().length))
                .requireCurrentApproval(dossier, current);
    }

    @Test
    void staleApprovalBlocksEveryProtectedTransition() {
        org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.LEGAL_DECISION_STALE))
                .when(approvals).requireCurrentApproval(dossier, current);
        for (LegalWorkflowGuard.ProtectedTransition transition : LegalWorkflowGuard.ProtectedTransition.values()) {
            assertThatThrownBy(() -> guard.requireProtectedTransition(CASE_ID, transition))
                    .isInstanceOf(BusinessException.class)
                    .extracting(ex -> ((BusinessException) ex).getErrorCode())
                    .isEqualTo(ErrorCode.LEGAL_DECISION_STALE);
        }
    }

    @Test
    void holdBlocksBeforeApprovalLookup() {
        when(vault.getStatus()).thenReturn(Vault.STATUS_ON_HOLD);

        assertThatThrownBy(() -> guard.requireProtectedTransition(CASE_ID, LegalWorkflowGuard.ProtectedTransition.UNLOCK))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.LEGAL_WORKFLOW_ON_HOLD);
        org.mockito.Mockito.verifyNoInteractions(approvals);
    }

    @Test
    void nonLegalWorkflowStateCannotUnlockEvenWithAnApprovalRecord() {
        when(vault.getStatus()).thenReturn(Vault.STATUS_DOCUMENT_VERIFICATION);

        assertThatThrownBy(() -> guard.requireProtectedTransition(CASE_ID, LegalWorkflowGuard.ProtectedTransition.UNLOCK))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        org.mockito.Mockito.verifyNoInteractions(approvals);
    }

    @Test
    void notarialHistoryCannotEnterNewProtectedApprovalUnlockOrHandoverFlow() {
        when(dossier.getRoute()).thenReturn(LegalBasisDossier.ROUTE_NOTARIAL);
        for (LegalWorkflowGuard.ProtectedTransition transition : LegalWorkflowGuard.ProtectedTransition.values()) {
            assertThatThrownBy(() -> guard.requireProtectedTransition(CASE_ID, transition))
                    .isInstanceOf(BusinessException.class)
                    .extracting(ex -> ((BusinessException) ex).getErrorCode())
                    .isEqualTo(ErrorCode.COURT_DECISION_REQUIRED);
        }
        org.mockito.Mockito.verifyNoInteractions(approvals);
        org.mockito.Mockito.verifyNoInteractions(court);
    }
}
