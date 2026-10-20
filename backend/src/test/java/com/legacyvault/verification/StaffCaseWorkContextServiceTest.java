package com.legacyvault.verification;

import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.beneficiary.BeneficiaryRepository;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.trustee.TrusteeRepository;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.*;
import com.legacyvault.verification.service.LegalApprovalGuard;
import com.legacyvault.verification.service.StaffCaseWorkContextService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StaffCaseWorkContextServiceTest {
    @Mock VerificationCaseRepository cases;
    @Mock VaultRepository vaults;
    @Mock UserRepository users;
    @Mock TrusteeRepository trustees;
    @Mock BeneficiaryRepository beneficiaries;
    @Mock LegalBasisDossierRepository dossiers;
    @Mock LegalBasisDossierVersionRepository versions;
    @Mock LegalBasisVersionAllocationRepository allocations;
    @Mock CourtDecisionRepository courtDecisions;
    @Mock AssetRepository assets;
    @Mock LegalApprovalGuard approvals;
    StaffCaseWorkContextService service;
    CustomUserPrincipal staff;

    @BeforeEach void setUp() {
        service = new StaffCaseWorkContextService(cases, vaults, users, trustees, beneficiaries, dossiers,
                versions, allocations, courtDecisions, assets, approvals);
        staff = new CustomUserPrincipal(17L, UUID.randomUUID(), "staff@example.test");
    }

    @Test void assignedContextReturnsServerStateWithoutIdentityVerificationResult() {
        UUID caseId = UUID.randomUUID();
        VerificationCase item = mock(VerificationCase.class);
        Vault vault = mock(Vault.class);
        User assigned = mock(User.class);
        when(cases.findViewableCaseByPublicId(caseId, 17L)).thenReturn(Optional.of(item));
        when(item.getVaultId()).thenReturn(40L);
        when(item.getAssignedStaffUserId()).thenReturn(17L);
        when(item.getCaseNumber()).thenReturn("HS-2026-000123");
        when(item.getVerificationCaseId()).thenReturn(99L);
        when(item.getStatus()).thenReturn("CANCELLED");
        when(vaults.findById(40L)).thenReturn(Optional.of(vault));
        when(vault.getVaultId()).thenReturn(40L);
        when(vault.getPublicId()).thenReturn(UUID.randomUUID());
        when(vault.getStatus()).thenReturn(Vault.STATUS_ON_HOLD);
        when(users.findById(17L)).thenReturn(Optional.of(assigned));
        when(assigned.getPublicId()).thenReturn(staff.publicId());
        when(trustees.findFirstByVault_VaultIdAndStatus(40L, "APPOINTED")).thenReturn(Optional.empty());
        when(beneficiaries.findAllByVault_VaultId(eq(40L), any(PageRequest.class)))
                .thenReturn(new PageImpl<>(java.util.List.of()));
        when(dossiers.findByVerificationCaseId(99L)).thenReturn(Optional.empty());

        var result = service.get(caseId, staff);

        assertEquals("ASSIGNED", result.assignment());
        assertEquals("CANCELLED", result.caseStatus());
        assertEquals("ON_HOLD", result.workflowStep());
        assertTrue(result.onHold());
        assertTrue(result.unmetConditions().contains("LEGAL_BASIS_DOSSIER_MISSING"));
        assertTrue(result.unmetConditions().contains("TRUSTEE_NOT_APPOINTED_CONTACT_FALLBACK_POLICY_UNDECIDED"));
        assertFalse(result.toString().contains("VERIFIED_AT_COUNTER"));
        verifyNoInteractions(approvals);
    }

    @Test void inaccessibleCaseIsHiddenAsNotFound() {
        UUID caseId = UUID.randomUUID();
        when(cases.findViewableCaseByPublicId(caseId, 17L)).thenReturn(Optional.empty());
        assertThrows(BusinessException.class, () -> service.get(caseId, staff));
        verifyNoInteractions(vaults, trustees, beneficiaries, dossiers);
    }
}
