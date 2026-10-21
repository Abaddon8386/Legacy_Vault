package com.legacyvault.verification;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.StaffVerificationCaseResponse;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.StaffVerificationCaseService;
import com.legacyvault.trustee.TrusteeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StaffVerificationCaseServiceTest {

    @Test
    void detailReturnsHumanReferenceAlongsideOriginalUuid() {
        var item = mock(VerificationCase.class);
        var vault = mock(com.legacyvault.vault.entity.Vault.class);
        var owner = mock(com.legacyvault.user.entity.User.class);
        UUID caseId = UUID.randomUUID();
        when(caseRepository.findViewableCaseByPublicId(caseId, 10L)).thenReturn(Optional.of(item));
        when(item.getVaultId()).thenReturn(20L);
        when(item.getPublicId()).thenReturn(caseId);
        when(item.getCaseNumber()).thenReturn("HS-2026-000123");
        when(item.getAssignedStaffUserId()).thenReturn(10L);
        when(vaultRepository.findById(20L)).thenReturn(Optional.of(vault));
        when(vault.getStatus()).thenReturn("AWAITING_VERIFICATION");
        when(vault.getOwnerUserId()).thenReturn(30L);
        when(vault.getVaultId()).thenReturn(20L);
        when(userRepository.findById(30L)).thenReturn(Optional.of(owner));
        when(trusteeRepository.findFirstByVault_VaultIdAndStatus(20L, "APPOINTED"))
                .thenReturn(Optional.empty());
        var result = service.getCase(caseId, staff);
        assertEquals(caseId, result.caseId());
        assertEquals("HS-2026-000123", result.caseNumber());
        assertEquals("ASSIGNED_TO_CURRENT_STAFF", result.assignmentStatus());
        assertEquals("AWAITING_VERIFICATION", result.vaultStatus());
        assertNull(result.trustee());
    }

    @Test
    void detailReturnsOnlyCurrentAppointedTrusteeContactSummary() {
        var item = mock(VerificationCase.class);
        var vault = mock(com.legacyvault.vault.entity.Vault.class);
        var owner = mock(com.legacyvault.user.entity.User.class);
        var trustee = mock(com.legacyvault.trustee.Trustee.class);
        UUID caseId = UUID.randomUUID();
        UUID trusteeId = UUID.randomUUID();
        when(caseRepository.findViewableCaseByPublicId(caseId, 10L)).thenReturn(Optional.of(item));
        when(item.getVaultId()).thenReturn(20L);
        when(item.getPublicId()).thenReturn(caseId);
        when(item.getAssignedStaffUserId()).thenReturn(null);
        when(item.getCaseNumber()).thenReturn("HS-2026-000123");
        when(vaultRepository.findById(20L)).thenReturn(Optional.of(vault));
        when(vault.getOwnerUserId()).thenReturn(30L);
        when(vault.getVaultId()).thenReturn(20L);
        when(vault.getPublicId()).thenReturn(UUID.randomUUID());
        when(vault.getStatus()).thenReturn("AWAITING_VERIFICATION");
        when(userRepository.findById(30L)).thenReturn(Optional.of(owner));
        when(trusteeRepository.findFirstByVault_VaultIdAndStatus(20L, "APPOINTED"))
                .thenReturn(Optional.of(trustee));
        when(trustee.getPublicId()).thenReturn(trusteeId);
        when(trustee.getFullName()).thenReturn("Trustee Example");
        when(trustee.getPhone()).thenReturn("+84900000000");
        when(trustee.getEmail()).thenReturn("trustee@example.test");
        when(trustee.getRelationship()).thenReturn("Relative");

        var result = service.getCase(caseId, staff);

        assertEquals("UNASSIGNED_CLAIMABLE", result.assignmentStatus());
        assertNotNull(result.trustee());
        assertEquals(trusteeId, result.trustee().trusteeId());
        assertEquals("Trustee Example", result.trustee().fullName());
        assertEquals("+84900000000", result.trustee().phone());
        assertEquals("trustee@example.test", result.trustee().email());
        assertEquals("Relative", result.trustee().relationship());
    }

    @Mock
    private VerificationCaseRepository caseRepository;

    @Mock
    private VaultRepository vaultRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private TrusteeRepository trusteeRepository;

    @InjectMocks
    private StaffVerificationCaseService service;

    private CustomUserPrincipal staff;

    @BeforeEach
    void setUp() {
        staff = new CustomUserPrincipal(
                10L, UUID.randomUUID(), "staff@example.com"
        );
    }

    @Test
    void listCases_withoutStatus_returnsPageForCurrentStaff() {
        Page<VerificationCase> emptyPage = new PageImpl<>(
                List.of(), PageRequest.of(0, 20), 0
        );

        when(caseRepository.findQueueByStaff(
                eq(10L), isNull(), any(PageRequest.class)
        )).thenReturn(emptyPage);

        PageResponse<StaffVerificationCaseResponse> result =
                service.listCases(staff, null, 0, 20);

        assertNotNull(result);
        assertTrue(result.content().isEmpty());
        assertEquals(0, result.page());
        assertEquals(20, result.size());
        assertEquals(0, result.totalElements());

        verify(caseRepository).findQueueByStaff(
                eq(10L), isNull(), any(PageRequest.class)
        );
        verifyNoInteractions(trusteeRepository);
    }

    @Test
    void listCases_withStatus_filtersByStatus() {
        Page<VerificationCase> emptyPage = new PageImpl<>(
                List.of(), PageRequest.of(0, 10), 0
        );

        when(caseRepository.findQueueByStaff(
                eq(10L), eq("OPEN"), any(PageRequest.class)
        )).thenReturn(emptyPage);

        PageResponse<StaffVerificationCaseResponse> result =
                service.listCases(staff, " open ", 0, 10);

        assertNotNull(result);
        assertTrue(result.content().isEmpty());

        verify(caseRepository).findQueueByStaff(
                eq(10L), eq("OPEN"), any(PageRequest.class)
        );
    }

    @Test
    void listCases_secondPage_usesRequestedPagination() {
        Page<VerificationCase> emptyPage = new PageImpl<>(
                List.of(), PageRequest.of(1, 5), 0
        );

        when(caseRepository.findQueueByStaff(
                eq(10L), isNull(), any(PageRequest.class)
        )).thenReturn(emptyPage);

        PageResponse<StaffVerificationCaseResponse> result =
                service.listCases(staff, null, 1, 5);

        assertEquals(1, result.page());
        assertEquals(5, result.size());

        verify(caseRepository).findQueueByStaff(
                eq(10L),
                isNull(),
                argThat(pageable ->
                        pageable.getPageNumber() == 1
                                && pageable.getPageSize() == 5)
        );
    }

    @Test
    void getCase_caseNotViewableByStaff_throwsNotFound() {
        UUID caseId = UUID.randomUUID();

        when(caseRepository.findViewableCaseByPublicId(
                caseId, 10L
        )).thenReturn(Optional.empty());

        assertThrows(
                BusinessException.class,
                () -> service.getCase(caseId, staff)
        );

        verify(caseRepository)
                .findViewableCaseByPublicId(caseId, 10L);

        verifyNoInteractions(vaultRepository, userRepository);
    }
}
