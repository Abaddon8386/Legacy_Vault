package com.legacyvault.verification;

import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.beneficiary.BeneficiaryRepository;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.trustee.TrusteeRepository;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.entity.LegalBasisDossier;
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
import java.time.LocalDate;
import java.util.List;

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
        BusinessException error = assertThrows(BusinessException.class, () -> service.get(caseId, staff));
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, error.getErrorCode());
        verifyNoInteractions(vaults, trustees, beneficiaries, dossiers);
    }

    @Test void openUnassignedCaseIsReportedAsClaimable() {
        UUID caseId = UUID.randomUUID();
        VerificationCase item = mock(VerificationCase.class);
        Vault vault = mock(Vault.class);
        when(cases.findViewableCaseByPublicId(caseId, 17L)).thenReturn(Optional.of(item));
        when(item.getVaultId()).thenReturn(40L);
        when(item.getAssignedStaffUserId()).thenReturn(null);
        when(item.getCaseNumber()).thenReturn("HS-2026-000124");
        when(item.getVerificationCaseId()).thenReturn(100L);
        when(item.getStatus()).thenReturn("OPEN");
        when(vaults.findById(40L)).thenReturn(Optional.of(vault));
        when(vault.getVaultId()).thenReturn(40L);
        when(vault.getPublicId()).thenReturn(UUID.randomUUID());
        when(vault.getStatus()).thenReturn(Vault.STATUS_ON_HOLD);
        when(trustees.findFirstByVault_VaultIdAndStatus(40L, "APPOINTED")).thenReturn(Optional.empty());
        when(beneficiaries.findAllByVault_VaultId(eq(40L), any(PageRequest.class)))
                .thenReturn(new PageImpl<>(List.of()));
        when(dossiers.findByVerificationCaseId(100L)).thenReturn(Optional.empty());

        var result = service.get(caseId, staff);

        assertEquals("UNASSIGNED_CLAIMABLE", result.assignment());
        assertNull(result.assignedStaffId());
        assertTrue(result.unmetConditions().contains("CASE_NOT_CLAIMED"));
    }

    @Test void unknownCaseIdIsNotFound() {
        UUID caseId = UUID.randomUUID();
        when(cases.findViewableCaseByPublicId(caseId, 17L)).thenReturn(Optional.empty());

        BusinessException error = assertThrows(BusinessException.class, () -> service.get(caseId, staff));

        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, error.getErrorCode());
    }

    @Test void courtWorkContextReportsMissingCurrentApprovalWithoutThrowing() {
        assertApprovalBlocker(ErrorCode.LEGAL_APPROVAL_REQUIRED);
    }

    @Test void courtWorkContextReportsStaleApprovalWithoutThrowing() {
        assertApprovalBlocker(ErrorCode.LEGAL_DECISION_STALE);
    }

    @Test void courtWorkContextHasNoApprovalBlockerWhenApprovalIsCurrent() {
        var response = contextWithApprovalBlocker(null);
        assertFalse(response.unmetConditions().contains(ErrorCode.LEGAL_APPROVAL_REQUIRED.name()));
        assertFalse(response.unmetConditions().contains(ErrorCode.LEGAL_DECISION_STALE.name()));
    }

    @Test void courtWorkContextWithoutCurrentEvidenceReportsDocumentBlockerWithoutCallingApprovalGuard() {
        var response = contextWithApprovalBlocker(null, false);
        assertTrue(response.unmetConditions().contains("COURT_DOCUMENT_NOT_REVIEWABLE"));
        verifyNoInteractions(approvals);
    }

    private void assertApprovalBlocker(ErrorCode blocker) {
        var response = contextWithApprovalBlocker(blocker);
        assertTrue(response.unmetConditions().contains(blocker.name()));
        verify(approvals, never()).requireCurrentApproval(any(), any());
    }

    private com.legacyvault.verification.dto.StaffCaseWorkContextResponse contextWithApprovalBlocker(
            ErrorCode blocker) {
        return contextWithApprovalBlocker(blocker, true);
    }

    private com.legacyvault.verification.dto.StaffCaseWorkContextResponse contextWithApprovalBlocker(
            ErrorCode blocker, boolean hasCurrentEvidence) {
        UUID caseId = UUID.randomUUID();
        VerificationCase item = mock(VerificationCase.class);
        Vault vault = mock(Vault.class);
        User assigned = mock(User.class);
        LegalBasisDossier dossier = mock(LegalBasisDossier.class);
        when(cases.findViewableCaseByPublicId(caseId, 17L)).thenReturn(Optional.of(item));
        when(item.getVaultId()).thenReturn(40L);
        when(item.getAssignedStaffUserId()).thenReturn(17L);
        when(item.getCaseNumber()).thenReturn("HS-2026-000123");
        when(item.getVerificationCaseId()).thenReturn(99L);
        when(item.getStatus()).thenReturn("OPEN");
        when(vaults.findById(40L)).thenReturn(Optional.of(vault));
        when(vault.getVaultId()).thenReturn(40L);
        when(vault.getPublicId()).thenReturn(UUID.randomUUID());
        when(vault.getStatus()).thenReturn(Vault.STATUS_LEGAL_BASIS_VERIFICATION);
        when(users.findById(17L)).thenReturn(Optional.of(assigned));
        when(assigned.getPublicId()).thenReturn(staff.publicId());
        when(trustees.findFirstByVault_VaultIdAndStatus(40L, "APPOINTED")).thenReturn(Optional.empty());
        when(beneficiaries.findAllByVault_VaultId(eq(40L), any(PageRequest.class)))
                .thenReturn(new PageImpl<>(List.of()));
        when(dossiers.findByVerificationCaseId(99L)).thenReturn(Optional.of(dossier));
        when(dossier.getLegalBasisDossierId()).thenReturn(900L);
        when(dossier.getRoute()).thenReturn(LegalBasisDossier.ROUTE_COURT);
        when(dossier.getStatus()).thenReturn(LegalBasisDossier.STATUS_FORWARDED);
        when(dossier.getReviewStatus()).thenReturn("FRESH");
        when(dossier.getRequiredVersionNo()).thenReturn(1);
        when(versions.findMaxVersionNo(900L)).thenReturn(1);
        var evidence = new CourtEvidenceVersion(901L, 1, "a".repeat(64), "COURT_JUDGMENT",
                "Court", "DOC-1", LocalDate.now(), "FORWARDED", true);
        when(versions.findCourtEvidence(900L, 1))
                .thenReturn(hasCurrentEvidence ? Optional.of(evidence) : Optional.empty());
        if (hasCurrentEvidence) {
            when(courtDecisions.findFirstByDossierVersionIdOrderByIdDesc(901L)).thenReturn(Optional.empty());
            when(allocations.findRowsByDossier(900L)).thenReturn(List.of());
            when(approvals.currentApprovalBlocker(dossier, evidence)).thenReturn(blocker);
        }
        return service.get(caseId, staff);
    }
}
