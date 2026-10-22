package com.legacyvault.beneficiary;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.HandoverScopeResolver;
import com.legacyvault.verification.service.LegalBasisCaseAccess;
import com.legacyvault.verification.service.LegalWorkflowGuard;
import com.legacyvault.verification.service.StaffVaultCaseGuard;
import com.legacyvault.vault.entity.Vault;

import jakarta.persistence.EntityManager;

class StaffInvitationEmailServiceTest {
    private static final Long STAFF_ID = 10L;
    private static final Long VAULT_ID = 20L;
    private static final Long BENEFICIARY_DB_ID = 30L;
    private static final Long CASE_DB_ID = 40L;
    private static final UUID CASE_ID = UUID.randomUUID();
    private static final UUID BENEFICIARY_ID = UUID.randomUUID();

    private final VerificationCaseRepository cases = mock(VerificationCaseRepository.class);
    private final StaffCaseLockRepository caseLocks = mock(StaffCaseLockRepository.class);
    private final BeneficiaryRepository beneficiaries = mock(BeneficiaryRepository.class);
    private final BeneficiaryCounterAttestationRepository attestations = mock(BeneficiaryCounterAttestationRepository.class);
    private final BeneficiaryInvitationRepository invitations = mock(BeneficiaryInvitationRepository.class);
    private final StaffContextService staff = mock(StaffContextService.class);
    private final StaffVaultCaseGuard caseGuard = mock(StaffVaultCaseGuard.class);
    private final LegalWorkflowGuard legalGuard = mock(LegalWorkflowGuard.class);
    private final LegalBasisDossierVersionRepository versions = mock(LegalBasisDossierVersionRepository.class);
    private final HandoverScopeResolver scope = mock(HandoverScopeResolver.class);
    private final BeneficiaryInvitationService invitationService = mock(BeneficiaryInvitationService.class);
    private final InvitationMailOutboxService outboxService = mock(InvitationMailOutboxService.class);
    private final AuditService audit = mock(AuditService.class);
    private final EntityManager entities = mock(EntityManager.class);
    private final StaffInvitationEmailService service = new StaffInvitationEmailService(cases, caseLocks,
            beneficiaries, attestations, invitations, staff, caseGuard, legalGuard, versions, scope,
            invitationService, outboxService, audit, entities,new InvitationMailConfiguration(false,"","",""));

    private final User actor = mock(User.class);
    private final VerificationCase verificationCase = mock(VerificationCase.class);
    private final Beneficiary beneficiary = mock(Beneficiary.class);
    private final LegalBasisDossier dossier = mock(LegalBasisDossier.class);
    private final BeneficiaryCounterAttestation attestation = mock(BeneficiaryCounterAttestation.class);

    @BeforeEach
    void setUp() {
        when(actor.getUserId()).thenReturn(STAFF_ID);
        when(staff.requireStaff()).thenReturn(actor);
        when(cases.findByPublicIdAndAssignedStaffUserId(CASE_ID, STAFF_ID)).thenReturn(Optional.of(verificationCase));
        when(verificationCase.getVaultId()).thenReturn(VAULT_ID);
        when(verificationCase.getVerificationCaseId()).thenReturn(CASE_DB_ID);
        when(verificationCase.isOpen()).thenReturn(true);
        when(caseLocks.findOwnedByStaffForUpdate(CASE_ID, STAFF_ID)).thenReturn(Optional.of(verificationCase));
        when(legalGuard.requireProtectedTransition(CASE_ID, LegalWorkflowGuard.ProtectedTransition.HANDOVER))
                .thenReturn(new LegalBasisCaseAccess.LockedCase(mock(Vault.class), verificationCase, dossier));
        when(dossier.getLegalBasisDossierId()).thenReturn(50L);
        when(versions.findMaxVersionNo(50L)).thenReturn(3);
        when(beneficiaries.findByPublicIdAndVault_VaultId(BENEFICIARY_ID, VAULT_ID)).thenReturn(Optional.of(beneficiary));
        when(beneficiary.getId()).thenReturn(BENEFICIARY_DB_ID);
        when(beneficiary.getPublicId()).thenReturn(BENEFICIARY_ID);
        when(beneficiary.getIdentityVerificationStatus()).thenReturn(Beneficiary.VERIFIED_AT_COUNTER);
        when(beneficiary.hasAccount()).thenReturn(false);
        when(scope.resolve(50L, 3, BENEFICIARY_ID)).thenReturn(List.of());
        when(attestations.findFirstByVerificationCase_PublicIdAndBeneficiary_PublicIdOrderByIdDesc(CASE_ID, BENEFICIARY_ID))
                .thenReturn(Optional.of(attestation));
        when(attestation.getConfirmedEmail()).thenReturn("recipient@example.test");
        when(outboxService.findByRequest(BENEFICIARY_DB_ID, 1)).thenReturn(Optional.empty());
    }

    @Test
    void queuesForStaffConfirmedEmailOnlyAfterLegalAndAllocationGates() {
        var metadata = new InvitationDtos.Metadata(UUID.randomUUID(), BENEFICIARY_ID, "PENDING", 2,
                null, null, null, null);
        when(invitationService.issueBoundForStaff(beneficiary, "recipient@example.test", STAFF_ID, 1))
                .thenReturn(new InvitationDtos.Issued(metadata, "raw-code-never-returned"));
        var invitation = mock(BeneficiaryInvitation.class);
        when(invitation.getGeneration()).thenReturn(2);
        when(invitations.findByBeneficiary_IdAndGeneration(BENEFICIARY_DB_ID, 2)).thenReturn(Optional.of(invitation));
        var row = mock(BeneficiaryInvitationOutbox.class);
        when(row.getPublicId()).thenReturn(UUID.randomUUID());
        when(row.getInvitationPublicId()).thenReturn(metadata.invitationId());
        when(row.getInvitationGeneration()).thenReturn(2);
        when(row.getTransportStatus()).thenReturn("QUEUED");
        when(outboxService.enqueueForCase(invitation, BENEFICIARY_DB_ID, 1, "recipient@example.test", "raw-code-never-returned",CASE_DB_ID,STAFF_ID))
                .thenReturn(row);

        InvitationEmailDtos.Queued response = service.request(CASE_ID, BENEFICIARY_ID, 1);

        assertEquals("QUEUED", response.queueStatus());
        assertEquals("DISABLED", response.transportStatus());
        assertEquals(2, response.invitationGeneration());
        verify(caseGuard).requireOpenForWrite(VAULT_ID, STAFF_ID);
        verify(legalGuard).requireProtectedTransition(CASE_ID, LegalWorkflowGuard.ProtectedTransition.HANDOVER);
        verify(scope).resolve(50L, 3, BENEFICIARY_ID);
        verify(audit).record(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void missingCounterConfirmedEmailDoesNotIssueOrQueue() {
        when(attestation.getConfirmedEmail()).thenReturn(null);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.request(CASE_ID, BENEFICIARY_ID, 1));

        assertEquals(ErrorCode.BENEFICIARY_INVITATION_COUNTER_EMAIL_REQUIRED, error.getErrorCode());
        verify(invitationService, never()).issueBoundForStaff(any(), any(), any(), any(int.class));
        verify(outboxService, never()).enqueue(any(), any(), any(int.class), any(), any());
    }
}
