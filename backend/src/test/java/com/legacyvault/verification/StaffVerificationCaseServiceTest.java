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

    @Mock
    private VerificationCaseRepository caseRepository;

    @Mock
    private VaultRepository vaultRepository;

    @Mock
    private UserRepository userRepository;

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
