package com.legacyvault.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import com.legacyvault.verification.service.LegalBasisReviewService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.springframework.test.util.ReflectionTestUtils;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.BasisDossierResponse;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.BasisDossierViewService;
import com.legacyvault.verification.service.BasisForwardService;

/** PS-42 (ST-19): chỉ phiên bản mới nhất được chuyển Legal; phiên bản cũ bị phân biệt và vẫn được giữ. */
class BasisForwardServiceTest {

    private static final Long STAFF_ID = 10L;
    private static final Long VAULT_ID = 77L;
    private static final Long CASE_DB_ID = 500L;
    private static final Long DOSSIER_DB_ID = 900L;
    private static final UUID CASE_ID = UUID.randomUUID();

    private final StaffCaseLockRepository staffCases = mock(StaffCaseLockRepository.class);
    private final VerificationCaseRepository caseRepository = mock(VerificationCaseRepository.class);
    private final VaultRepository vaultRepository = mock(VaultRepository.class);
    private final LegalBasisDossierRepository dossiers = mock(LegalBasisDossierRepository.class);
    private final LegalBasisDossierVersionRepository versions = mock(LegalBasisDossierVersionRepository.class);
    private final BasisDossierViewService views = mock(BasisDossierViewService.class);
    private final AuditService auditService = mock(AuditService.class);
    private final LegalBasisReviewService legalBasisReviewService = mock(LegalBasisReviewService.class);

    private final BasisForwardService service = new BasisForwardService(
            staffCases,
            caseRepository,
            vaultRepository,
            dossiers,
            versions,
            views,
            auditService,
            legalBasisReviewService
    );


    private final CustomUserPrincipal staff = new CustomUserPrincipal(STAFF_ID, UUID.randomUUID(), "staff@example.com");

    private static VerificationCase theCase() {
        VerificationCase c = new VerificationCase(VAULT_ID, LocalDateTime.of(2026, 10, 1, 8, 0), null);
        ReflectionTestUtils.setField(c, "verificationCaseId", CASE_DB_ID);
        ReflectionTestUtils.setField(c, "publicId", CASE_ID);
        ReflectionTestUtils.setField(c, "assignedStaffUserId", STAFF_ID);
        return c;
    }

    private static Vault vault(String status) {
        Vault v = new Vault();
        ReflectionTestUtils.setField(v, "vaultId", VAULT_ID);
        ReflectionTestUtils.setField(v, "status", status);
        return v;
    }

    private static LegalBasisDossier dossier(String status) {
        LegalBasisDossier d = new LegalBasisDossier(CASE_DB_ID, "NOTARIAL", "lý do", "NONE", 20L);
        ReflectionTestUtils.setField(d, "legalBasisDossierId", DOSSIER_DB_ID);
        ReflectionTestUtils.setField(d, "publicId", UUID.randomUUID());
        ReflectionTestUtils.setField(d, "status", status);
        return d;
    }

    private static ErrorCode codeOf(Throwable ex) {
        return ((BusinessException) ex).getErrorCode();
    }

    private Vault happyPath(LegalBasisDossier dossier, int currentVersion) {
        Vault vault = vault("AWAITING_LEGAL_BASIS");
        when(staffCases.findOwnedByStaff(CASE_ID, STAFF_ID)).thenReturn(Optional.of(theCase()));
        when(vaultRepository.findByIdForUpdate(VAULT_ID)).thenReturn(Optional.of(vault));
        when(caseRepository.findByIdForUpdate(CASE_DB_ID)).thenReturn(Optional.of(theCase()));
        when(dossiers.findByVerificationCaseIdForUpdate(CASE_DB_ID)).thenReturn(Optional.of(dossier));
        when(versions.findMaxVersionNo(DOSSIER_DB_ID)).thenReturn(currentVersion);
        when(versions.markForwarded(anyLong(), anyInt(), anyLong(), any(LocalDateTime.class))).thenReturn(1);
        return vault;
    }

    @Test
    void latestVersion_isForwarded_dossierForwarded_vaultMovesToVerification_andAudits() {
        LegalBasisDossier dossier = dossier("LEGAL_BASIS_PROVIDED");
        Vault vault = happyPath(dossier, 2);
        BasisDossierResponse expected = mock(BasisDossierResponse.class);
        when(views.view(any(VerificationCase.class), org.mockito.ArgumentMatchers.eq(false))).thenReturn(expected);

        BasisDossierResponse response = service.forward(CASE_ID, 2, staff);

        assertThat(response).isSameAs(expected);
        verify(versions).markForwarded(org.mockito.ArgumentMatchers.eq(DOSSIER_DB_ID), org.mockito.ArgumentMatchers.eq(2),
                org.mockito.ArgumentMatchers.eq(STAFF_ID), any(LocalDateTime.class));
        assertThat(dossier.getStatus()).isEqualTo("LEGAL_BASIS_FORWARDED");
        assertThat(vault.getStatus()).isEqualTo("LEGAL_BASIS_VERIFICATION");

        ArgumentCaptor<AuditEvent> audit = ArgumentCaptor.forClass(AuditEvent.class);
        verify(auditService).record(audit.capture());
        AuditEvent event = audit.getValue();
        assertThat(event.action()).isEqualTo(AuditAction.LEGAL_BASIS_FORWARDED);
        assertThat(event.stepId()).isEqualTo("ST-19");
        assertThat(event.ruleId()).isEqualTo("LV-BASIS-001");
        assertThat(event.stateBefore()).isEqualTo("AWAITING_LEGAL_BASIS");
        assertThat(event.stateAfter()).isEqualTo("LEGAL_BASIS_VERIFICATION");
        assertThat(event.context()).containsEntry("version", 2).containsEntry("route", "NOTARIAL");
    }

    @Test
    void staleVersion_isRejected_andNothingIsForwarded() {
        LegalBasisDossier dossier = dossier("LEGAL_BASIS_PROVIDED");
        Vault vault = happyPath(dossier, 3);

        assertThatThrownBy(() -> service.forward(CASE_ID, 2, staff))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.BASIS_VERSION_STALE));
        assertThatThrownBy(() -> service.forward(CASE_ID, 1, staff))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.BASIS_VERSION_STALE));

        verify(versions, never()).markForwarded(anyLong(), anyInt(), anyLong(), any());
        assertThat(dossier.getStatus()).isEqualTo("LEGAL_BASIS_PROVIDED");
        assertThat(vault.getStatus()).isEqualTo("AWAITING_LEGAL_BASIS");
        verifyNoInteractions(auditService);
    }

    @Test
    void unknownVersion_isNotFound() {
        happyPath(dossier("LEGAL_BASIS_PROVIDED"), 2);

        assertThatThrownBy(() -> service.forward(CASE_ID, 3, staff))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
        assertThatThrownBy(() -> service.forward(CASE_ID, 0, staff))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
    }

    @Test
    void wrongStates_areConflict() {
        for (String status : new String[] { "DRAFT", "LEGAL_BASIS_FORWARDED" }) {
            happyPath(dossier(status), 1);
            assertThatThrownBy(() -> service.forward(CASE_ID, 1, staff))
                    .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE));
        }

        happyPath(dossier("LEGAL_BASIS_PROVIDED"), 1);
        when(versions.markForwarded(anyLong(), anyInt(), anyLong(), any(LocalDateTime.class))).thenReturn(0);
        assertThatThrownBy(() -> service.forward(CASE_ID, 1, staff))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE));

        for (String status : new String[] { "ON_HOLD", "LEGAL_BASIS_VERIFICATION", "WILL_VERIFICATION" }) {
            happyPath(dossier("LEGAL_BASIS_PROVIDED"), 1);
            when(vaultRepository.findByIdForUpdate(VAULT_ID)).thenReturn(Optional.of(vault(status)));
            assertThatThrownBy(() -> service.forward(CASE_ID, 1, staff))
                    .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE));
        }
        verifyNoInteractions(auditService);
    }

    @Test
    void caseNotOwnedByStaff_isNotFound() {
        when(staffCases.findOwnedByStaff(CASE_ID, STAFF_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.forward(CASE_ID, 1, staff))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
        assertThatThrownBy(() -> service.forward(CASE_ID, 1, null))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.UNAUTHENTICATED));
        verifyNoInteractions(vaultRepository, caseRepository, dossiers, versions, auditService);
    }

    @Test
    void locksVaultThenCaseThenDossier() {
        happyPath(dossier("LEGAL_BASIS_PROVIDED"), 1);

        service.forward(CASE_ID, 1, staff);

        InOrder order = inOrder(staffCases, vaultRepository, caseRepository, dossiers, versions);
        order.verify(staffCases).findOwnedByStaff(CASE_ID, STAFF_ID);
        order.verify(vaultRepository).findByIdForUpdate(VAULT_ID);
        order.verify(caseRepository).findByIdForUpdate(CASE_DB_ID);
        order.verify(dossiers).findByVerificationCaseIdForUpdate(CASE_DB_ID);
        order.verify(versions).markForwarded(anyLong(), anyInt(), anyLong(), any(LocalDateTime.class));
    }
}
