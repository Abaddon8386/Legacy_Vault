package com.legacyvault.beneficiary;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.argThat;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.legacyvault.common.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.user.entity.User;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.StaffVaultCaseGuard;

import jakarta.persistence.EntityManager;

class CounterIdentityAttestationServiceTest {
    @Test
    void recordsServerStampedAttestationForAssignedOpenCaseAndAuditsWithoutReference() {
        UUID caseId = UUID.randomUUID();
        UUID beneficiaryId = UUID.randomUUID();
        UUID staffPublicId = UUID.randomUUID();
        User actor = mock(User.class);
        when(actor.getUserId()).thenReturn(7L);
        when(actor.getPublicId()).thenReturn(staffPublicId);
        StaffContextService staff = mock(StaffContextService.class);
        when(staff.requireStaff()).thenReturn(actor);
        VerificationCase verificationCase = mock(VerificationCase.class);
        when(verificationCase.getVaultId()).thenReturn(9L);
        when(verificationCase.getPublicId()).thenReturn(caseId);
        when(verificationCase.isOpen()).thenReturn(true);
        VerificationCaseRepository cases = mock(VerificationCaseRepository.class);
        when(cases.findByPublicIdAndAssignedStaffUserId(caseId, 7L)).thenReturn(Optional.of(verificationCase));
        StaffCaseLockRepository caseLocks = mock(StaffCaseLockRepository.class);
        when(caseLocks.findOwnedByStaffForUpdate(caseId, 7L)).thenReturn(Optional.of(verificationCase));
        Vault vault = mock(Vault.class);
        when(vault.getVaultId()).thenReturn(9L);
        Beneficiary beneficiary = mock(Beneficiary.class);
        when(beneficiary.getVault()).thenReturn(vault);
        when(beneficiary.getPublicId()).thenReturn(beneficiaryId);
        BeneficiaryRepository beneficiaries = mock(BeneficiaryRepository.class);
        when(beneficiaries.findByPublicIdAndVault_VaultId(beneficiaryId, 9L)).thenReturn(Optional.of(beneficiary));
        BeneficiaryCounterAttestationRepository attestations = mock(BeneficiaryCounterAttestationRepository.class);
        when(attestations.saveAndFlush(any())).thenAnswer(call -> {
            BeneficiaryCounterAttestation saved = call.getArgument(0);
            saved.onCreate();
            return saved;
        });
        AuditService audit = mock(AuditService.class);
        CounterIdentityAttestationService service = new CounterIdentityAttestationService(cases, caseLocks,
                beneficiaries, attestations, staff, mock(StaffVaultCaseGuard.class), mock(EntityManager.class), audit);

        var response = service.attest(caseId, beneficiaryId,
                new CounterIdentityAttestationDtos.Request("COUNTER-RECEIPT-17", " Recipient@Example.COM "));

        assertEquals(caseId, response.caseId());
        assertEquals(beneficiaryId, response.beneficiaryId());
        assertEquals(staffPublicId, response.recordedBy());
        assertNotNull(response.recordedAt());
        verify(attestations).saveAndFlush(argThat(saved -> saved.getEvidenceReference().equals("COUNTER-RECEIPT-17")
                && saved.getConfirmedEmail().equals("recipient@example.com")
                && saved.getStaffUserId().equals(7L)
                && saved.getVerificationCase().equals(verificationCase)
                && saved.getBeneficiary().equals(beneficiary)));
        var auditDetails = org.mockito.ArgumentCaptor.forClass(java.util.Map.class);
        verify(audit).record(eq(7L), eq(9L), eq("BENEFICIARY_COUNTER_ATTESTED"),
                eq("BENEFICIARY_COUNTER_ATTESTATION"), any(), eq("USER"), auditDetails.capture());
        assertEquals(java.util.Map.of("caseId", caseId.toString(), "beneficiaryId", beneficiaryId.toString(),
                "evidenceReferenceRecorded", true, "confirmedEmailRecorded", true), auditDetails.getValue());
    }

    @Test
    void refusesCaseNotAssignedToAuthenticatedStaffBeforeWriting() {
        UUID caseId = UUID.randomUUID();
        VerificationCaseRepository cases = mock(VerificationCaseRepository.class);
        when(cases.findByPublicIdAndAssignedStaffUserId(eq(caseId), eq(7L))).thenReturn(Optional.empty());
        StaffContextService staff = mock(StaffContextService.class);
        User actor = mock(User.class);
        when(actor.getUserId()).thenReturn(7L);
        when(staff.requireStaff()).thenReturn(actor);
        BeneficiaryCounterAttestationRepository attestations = mock(BeneficiaryCounterAttestationRepository.class);
        AuditService audit = mock(AuditService.class);
        CounterIdentityAttestationService service = new CounterIdentityAttestationService(cases,
                mock(StaffCaseLockRepository.class), mock(BeneficiaryRepository.class), attestations, staff,
                mock(StaffVaultCaseGuard.class), mock(EntityManager.class), audit);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.attest(caseId, UUID.randomUUID(), new CounterIdentityAttestationDtos.Request("REF-1", null)));

        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, error.getErrorCode());
        verify(attestations, never()).saveAndFlush(any());
        verifyNoInteractions(audit);
    }
}
