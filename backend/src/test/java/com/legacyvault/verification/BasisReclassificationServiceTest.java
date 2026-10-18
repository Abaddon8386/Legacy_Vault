package com.legacyvault.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
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
import com.legacyvault.verification.dto.ClassifyBasisRequest;
import com.legacyvault.verification.dto.ClassifyBasisRequest.Route;
import com.legacyvault.verification.entity.LegalBasisClassificationHistory;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.LegalBasisClassificationHistoryRepository;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalCaseLookupRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.BasisDossierViewService;
import com.legacyvault.verification.service.LegalBasisLockedState;
import com.legacyvault.verification.service.BasisReclassificationService;
import com.legacyvault.verification.service.WillComparisonService;

/** PS-43 (ST-16, LV-HOLD-001): chỉ ON_HOLD được phân loại lại; lưu lịch sử; NOTARIAL/COURT không đổi lẫn nhau. */
class BasisReclassificationServiceTest {

    private static final Long LEGAL_ID = 21L;
    private static final Long FIRST_LEGAL_ID = 20L;
    private static final Long VAULT_ID = 77L;
    private static final Long CASE_DB_ID = 500L;
    private static final UUID CASE_ID = UUID.randomUUID();

    private final LegalCaseLookupRepository caseLookup = mock(LegalCaseLookupRepository.class);
    private final VerificationCaseRepository caseRepository = mock(VerificationCaseRepository.class);
    private final VaultRepository vaultRepository = mock(VaultRepository.class);
    private final LegalBasisDossierRepository dossiers = mock(LegalBasisDossierRepository.class);
    private final LegalBasisClassificationHistoryRepository history = mock(LegalBasisClassificationHistoryRepository.class);
    private final WillComparisonService willComparisons = mock(WillComparisonService.class);
    private final BasisDossierViewService views = mock(BasisDossierViewService.class);
    private final AuditService auditService = mock(AuditService.class);
    private final BasisReclassificationService service = new BasisReclassificationService(caseLookup, caseRepository,
            vaultRepository, dossiers, history, willComparisons, views, auditService, mock(LegalBasisLockedState.class));

    private final CustomUserPrincipal legal = new CustomUserPrincipal(LEGAL_ID, UUID.randomUUID(), "legal@example.com");

    private static VerificationCase openCase() {
        VerificationCase c = new VerificationCase(VAULT_ID, LocalDateTime.of(2026, 10, 1, 8, 0), null);
        ReflectionTestUtils.setField(c, "verificationCaseId", CASE_DB_ID);
        ReflectionTestUtils.setField(c, "publicId", CASE_ID);
        return c;
    }

    private static Vault vault(String status) {
        Vault v = new Vault();
        ReflectionTestUtils.setField(v, "vaultId", VAULT_ID);
        ReflectionTestUtils.setField(v, "status", status);
        return v;
    }

    private static LegalBasisDossier dossier(String route, String status) {
        String dispute = "ON_HOLD".equals(route) ? "UNDETERMINED" : "COURT".equals(route) ? "DISPUTED" : "NONE";
        LegalBasisDossier d = new LegalBasisDossier(CASE_DB_ID, route, "Chưa đủ thông tin", dispute, FIRST_LEGAL_ID);
        ReflectionTestUtils.setField(d, "legalBasisDossierId", 900L);
        ReflectionTestUtils.setField(d, "publicId", UUID.randomUUID());
        ReflectionTestUtils.setField(d, "status", status);
        return d;
    }

    private static ErrorCode codeOf(Throwable ex) {
        return ((BusinessException) ex).getErrorCode();
    }

    private Vault happyPath(LegalBasisDossier dossier) {
        Vault vault = vault("ON_HOLD");
        when(caseLookup.findByPublicId(CASE_ID)).thenReturn(Optional.of(openCase()));
        when(vaultRepository.findByIdForUpdate(VAULT_ID)).thenReturn(Optional.of(vault));
        when(caseRepository.findByIdForUpdate(CASE_DB_ID)).thenReturn(Optional.of(openCase()));
        when(dossiers.findByVerificationCaseIdForUpdate(CASE_DB_ID)).thenReturn(Optional.of(dossier));
        when(willComparisons.isApprovalBlocked(CASE_DB_ID)).thenReturn(false);
        return vault;
    }

    private static ClassifyBasisRequest request(Route route, String reason) {
        return new ClassifyBasisRequest(route, reason);
    }

    @Test
    void onHoldToNotarial_savesHistory_updatesDossier_movesVault_andAuditsWithoutReason() {
        LegalBasisDossier dossier = dossier("ON_HOLD", "DRAFT");
        Vault vault = happyPath(dossier);
        BasisDossierResponse expected = mock(BasisDossierResponse.class);
        when(views.view(any(VerificationCase.class), org.mockito.ArgumentMatchers.eq(true))).thenReturn(expected);

        BasisDossierResponse response = service.reclassify(CASE_ID, legal,
                request(Route.NOTARIAL, "  Đã đủ chứng cứ không tranh chấp  "));

        assertThat(response).isSameAs(expected);
        ArgumentCaptor<LegalBasisClassificationHistory> saved = ArgumentCaptor.forClass(LegalBasisClassificationHistory.class);
        verify(history).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getRoute()).isEqualTo("ON_HOLD");
        assertThat(saved.getValue().getDisputeStatus()).isEqualTo("UNDETERMINED");
        assertThat(saved.getValue().getRouteReason()).isEqualTo("Chưa đủ thông tin");
        assertThat(saved.getValue().getClassifiedByUserId()).isEqualTo(FIRST_LEGAL_ID);

        assertThat(dossier.getRoute()).isEqualTo("NOTARIAL");
        assertThat(dossier.getDisputeStatus()).isEqualTo("NONE");
        assertThat(dossier.getRouteReason()).isEqualTo("Đã đủ chứng cứ không tranh chấp");
        assertThat(dossier.getClassifiedByUserId()).isEqualTo(LEGAL_ID);
        assertThat(dossier.getCreatedByUserId()).isEqualTo(FIRST_LEGAL_ID);
        assertThat(vault.getStatus()).isEqualTo("AWAITING_LEGAL_BASIS");
        verify(dossiers).saveAndFlush(dossier);

        ArgumentCaptor<AuditEvent> audit = ArgumentCaptor.forClass(AuditEvent.class);
        verify(auditService).record(audit.capture());
        AuditEvent event = audit.getValue();
        assertThat(event.action()).isEqualTo(AuditAction.LEGAL_BASIS_RECLASSIFIED);
        assertThat(event.stepId()).isEqualTo("ST-16");
        assertThat(event.ruleId()).isEqualTo("LV-HOLD-001");
        assertThat(event.stateBefore()).isEqualTo("ON_HOLD");
        assertThat(event.stateAfter()).isEqualTo("AWAITING_LEGAL_BASIS");
        assertThat(event.context()).containsEntry("previousRoute", "ON_HOLD").containsEntry("route", "NOTARIAL");
        assertThat(event.context().toString()).doesNotContain("chứng cứ");
    }

    @Test
    void onHoldToCourt_isDisputed() {
        LegalBasisDossier dossier = dossier("ON_HOLD", "DRAFT");
        happyPath(dossier);

        service.reclassify(CASE_ID, legal, request(Route.COURT, "Có tranh chấp"));

        assertThat(dossier.getRoute()).isEqualTo("COURT");
        assertThat(dossier.getDisputeStatus()).isEqualTo("DISPUTED");
    }

    @Test
    void courtOrNotarialDossier_cannotBeReclassified() {
        for (String route : new String[] { "COURT", "NOTARIAL" }) {
            LegalBasisDossier dossier = dossier(route, "DRAFT");
            happyPath(dossier);
            assertThatThrownBy(() -> service.reclassify(CASE_ID, legal, request(Route.NOTARIAL, "Trustee đổi lời khai")))
                    .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE));
            assertThat(dossier.getRoute()).isEqualTo(route);
        }
        verify(history, never()).saveAndFlush(any());
        verifyNoInteractions(auditService);
    }

    @Test
    void onHoldTarget_orBlankReason_isRejected_withoutReads() {
        assertThatThrownBy(() -> service.reclassify(CASE_ID, legal, request(Route.ON_HOLD, "x")))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.VALIDATION_FAILED));
        assertThatThrownBy(() -> service.reclassify(CASE_ID, legal, request(Route.COURT, "   ")))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.VALIDATION_FAILED));
        assertThatThrownBy(() -> service.reclassify(CASE_ID, null, request(Route.COURT, "x")))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.UNAUTHENTICATED));
        verifyNoInteractions(caseLookup, dossiers, history, auditService);
    }

    @Test
    void wrongStates_areConflict() {
        for (String vaultStatus : new String[] { "WILL_VERIFICATION", "AWAITING_LEGAL_BASIS", "ACTIVE" }) {
            happyPath(dossier("ON_HOLD", "DRAFT"));
            when(vaultRepository.findByIdForUpdate(VAULT_ID)).thenReturn(Optional.of(vault(vaultStatus)));
            assertThatThrownBy(() -> service.reclassify(CASE_ID, legal, request(Route.NOTARIAL, "x")))
                    .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE));
        }

        happyPath(dossier("ON_HOLD", "LEGAL_BASIS_PROVIDED"));
        assertThatThrownBy(() -> service.reclassify(CASE_ID, legal, request(Route.NOTARIAL, "x")))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE));

        happyPath(dossier("ON_HOLD", "DRAFT"));
        VerificationCase cancelled = openCase();
        cancelled.cancel(LocalDateTime.of(2026, 10, 2, 8, 0));
        when(caseRepository.findByIdForUpdate(CASE_DB_ID)).thenReturn(Optional.of(cancelled));
        assertThatThrownBy(() -> service.reclassify(CASE_ID, legal, request(Route.NOTARIAL, "x")))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE));

        verify(history, never()).saveAndFlush(any());
        verifyNoInteractions(auditService);
    }

    @Test
    void unknownCaseOrMissingDossier_isNotFound() {
        when(caseLookup.findByPublicId(CASE_ID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.reclassify(CASE_ID, legal, request(Route.NOTARIAL, "x")))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));

        happyPath(dossier("ON_HOLD", "DRAFT"));
        when(dossiers.findByVerificationCaseIdForUpdate(CASE_DB_ID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.reclassify(CASE_ID, legal, request(Route.NOTARIAL, "x")))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
    }

    @Test
    void withoutMatchingWillComparison_isBlocked() {
        LegalBasisDossier dossier = dossier("ON_HOLD", "DRAFT");
        Vault vault = happyPath(dossier);
        when(willComparisons.isApprovalBlocked(CASE_DB_ID)).thenReturn(true);

        assertThatThrownBy(() -> service.reclassify(CASE_ID, legal, request(Route.NOTARIAL, "x")))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.WILL_NOT_VERIFIED));
        assertThat(dossier.getRoute()).isEqualTo("ON_HOLD");
        assertThat(vault.getStatus()).isEqualTo("ON_HOLD");
        verify(history, never()).saveAndFlush(any());
    }

    @Test
    void locksVaultThenCaseThenDossier() {
        happyPath(dossier("ON_HOLD", "DRAFT"));

        service.reclassify(CASE_ID, legal, request(Route.NOTARIAL, "x"));

        InOrder order = inOrder(vaultRepository, caseRepository, dossiers, history);
        order.verify(vaultRepository).findByIdForUpdate(VAULT_ID);
        order.verify(caseRepository).findByIdForUpdate(CASE_DB_ID);
        order.verify(dossiers).findByVerificationCaseIdForUpdate(CASE_DB_ID);
        order.verify(history).saveAndFlush(any(LegalBasisClassificationHistory.class));
    }
}
