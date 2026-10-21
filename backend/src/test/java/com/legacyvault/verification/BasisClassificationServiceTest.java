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
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalCaseLookupRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.BasisClassificationService;
import com.legacyvault.verification.service.BasisDossierViewService;
import com.legacyvault.verification.service.LegalBasisLockedState;
import com.legacyvault.verification.service.WillComparisonService;

/** PS-102: Legal writes use COURT only; one dossier per case; will matching is not the legal basis gate. */
class BasisClassificationServiceTest {

    private static final Long LEGAL_ID = 20L;
    private static final Long VAULT_ID = 77L;
    private static final Long CASE_DB_ID = 500L;
    private static final UUID CASE_ID = UUID.randomUUID();

    private final LegalCaseLookupRepository caseLookup = mock(LegalCaseLookupRepository.class);
    private final VerificationCaseRepository caseRepository = mock(VerificationCaseRepository.class);
    private final VaultRepository vaultRepository = mock(VaultRepository.class);
    private final LegalBasisDossierRepository dossiers = mock(LegalBasisDossierRepository.class);
    private final WillComparisonService willComparisons = mock(WillComparisonService.class);
    private final BasisDossierViewService views = mock(BasisDossierViewService.class);
    private final AuditService auditService = mock(AuditService.class);
    private final BasisClassificationService service = new BasisClassificationService(caseLookup, caseRepository,
            vaultRepository, dossiers, willComparisons, views, auditService, mock(LegalBasisLockedState.class));

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

    private static ErrorCode codeOf(Throwable ex) {
        return ((BusinessException) ex).getErrorCode();
    }

    /** PS-102: classification uses court evidence; a will MATCH is not a prerequisite. */
    private Vault happyPath() {
        Vault vault = vault("WILL_VERIFICATION");
        when(caseLookup.findByPublicId(CASE_ID)).thenReturn(Optional.of(openCase()));
        when(vaultRepository.findByIdForUpdate(VAULT_ID)).thenReturn(Optional.of(vault));
        when(caseRepository.findByIdForUpdate(CASE_DB_ID)).thenReturn(Optional.of(openCase()));
        when(dossiers.findByVerificationCaseId(CASE_DB_ID)).thenReturn(Optional.empty());
        when(dossiers.saveAndFlush(any(LegalBasisDossier.class))).thenAnswer(inv -> {
            LegalBasisDossier d = inv.getArgument(0);
            ReflectionTestUtils.setField(d, "legalBasisDossierId", 900L);
            ReflectionTestUtils.setField(d, "publicId", UUID.randomUUID());
            return d;
        });
        return vault;
    }

    private static ClassifyBasisRequest request(Route route, String reason) {
        return new ClassifyBasisRequest(route, reason);
    }

    @Test
    void court_createsDossier_movesVaultToAwaitingLegalBasis_andAuditsWithoutReason() {
        Vault vault = happyPath();
        BasisDossierResponse expected = mock(BasisDossierResponse.class);
        when(views.view(any(VerificationCase.class), org.mockito.ArgumentMatchers.eq(true))).thenReturn(expected);

        BasisDossierResponse response = service.classify(CASE_ID, legal,
                request(Route.COURT, "  Có căn cứ theo quyết định của tòa án  "));

        assertThat(response).isSameAs(expected);
        ArgumentCaptor<LegalBasisDossier> saved = ArgumentCaptor.forClass(LegalBasisDossier.class);
        verify(dossiers).saveAndFlush(saved.capture());
        LegalBasisDossier d = saved.getValue();
        assertThat(d.getRoute()).isEqualTo("COURT");
        assertThat(d.getDisputeStatus()).isEqualTo("DISPUTED");
        assertThat(d.getStatus()).isEqualTo("DRAFT");
        assertThat(d.getRouteReason()).isEqualTo("Có căn cứ theo quyết định của tòa án");
        assertThat(d.getCreatedByUserId()).isEqualTo(LEGAL_ID);
        assertThat(vault.getStatus()).isEqualTo("AWAITING_LEGAL_BASIS");

        ArgumentCaptor<AuditEvent> audit = ArgumentCaptor.forClass(AuditEvent.class);
        verify(auditService).record(audit.capture());
        AuditEvent event = audit.getValue();
        assertThat(event.action()).isEqualTo(AuditAction.LEGAL_BASIS_CLASSIFIED);
        assertThat(event.stepId()).isEqualTo("ST-16");
        assertThat(event.ruleId()).isEqualTo("LV-BASIS-001");
        assertThat(event.stateBefore()).isEqualTo("WILL_VERIFICATION");
        assertThat(event.stateAfter()).isEqualTo("AWAITING_LEGAL_BASIS");
        assertThat(event.context()).containsEntry("route", "COURT").containsEntry("disputeStatus", "DISPUTED");
        assertThat(event.context().toString()).doesNotContain("quyết định");
    }

    @Test
    void courtIsDisputed_andOnHoldIsUndetermined_withVaultOnHold() {
        Vault vault = happyPath();
        service.classify(CASE_ID, legal, request(Route.COURT, "Có tranh chấp giữa các Beneficiary"));
        ArgumentCaptor<LegalBasisDossier> court = ArgumentCaptor.forClass(LegalBasisDossier.class);
        verify(dossiers).saveAndFlush(court.capture());
        assertThat(court.getValue().getDisputeStatus()).isEqualTo("DISPUTED");
        assertThat(vault.getStatus()).isEqualTo("AWAITING_LEGAL_BASIS");

        Vault holdVault = happyPath();
        service.classify(CASE_ID, legal, request(Route.ON_HOLD, "Chưa đủ thông tin"));
        assertThat(holdVault.getStatus()).isEqualTo("ON_HOLD");
    }

    @Test
    void blankOrMissingReason_isRejected_andNothingIsRead() {
        assertThatThrownBy(() -> service.classify(CASE_ID, legal, request(Route.COURT, "   ")))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.VALIDATION_FAILED));
        assertThatThrownBy(() -> service.classify(CASE_ID, legal, request(Route.COURT, null)))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.VALIDATION_FAILED));
        assertThatThrownBy(() -> service.classify(CASE_ID, null, request(Route.COURT, "x")))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.UNAUTHENTICATED));
        verifyNoInteractions(caseLookup, dossiers, auditService);
    }

    @Test
    void notarialRouteIsRejectedAsValidationFailure() {
        assertThatThrownBy(() -> service.classify(CASE_ID, legal, request(Route.NOTARIAL, "Legacy route")))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.VALIDATION_FAILED));
        verifyNoInteractions(caseLookup, dossiers, auditService);
    }

    @Test
    void unknownCase_isNotFound() {
        when(caseLookup.findByPublicId(CASE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.classify(CASE_ID, legal, request(Route.COURT, "x")))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
    }

    @Test
    void cancelledCaseOrWrongVaultStatus_isConflict() {
        happyPath();
        VerificationCase cancelled = openCase();
        cancelled.cancel(LocalDateTime.of(2026, 10, 2, 8, 0));
        when(caseRepository.findByIdForUpdate(CASE_DB_ID)).thenReturn(Optional.of(cancelled));
        assertThatThrownBy(() -> service.classify(CASE_ID, legal, request(Route.COURT, "x")))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE));

        for (String status : new String[] { "AWAITING_LEGAL_BASIS", "ON_HOLD", "ACTIVE" }) {
            happyPath();
            when(vaultRepository.findByIdForUpdate(VAULT_ID)).thenReturn(Optional.of(vault(status)));
            assertThatThrownBy(() -> service.classify(CASE_ID, legal, request(Route.COURT, "x")))
                    .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE));
        }
        verify(dossiers, never()).saveAndFlush(any());
        verifyNoInteractions(auditService);
    }

    @Test
    void secondDossierForTheSameCase_isRejected() {
        happyPath();
        when(dossiers.findByVerificationCaseId(CASE_DB_ID)).thenReturn(Optional.of(mock(LegalBasisDossier.class)));

        assertThatThrownBy(() -> service.classify(CASE_ID, legal, request(Route.COURT, "x")))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.BASIS_DOSSIER_ALREADY_EXISTS));
        verify(dossiers, never()).saveAndFlush(any());
    }

    @Test
    void classificationDoesNotUseWillComparisonAsSubstituteForCourtBasis() {
        happyPath();
        service.classify(CASE_ID, legal, request(Route.COURT, "Court basis available"));
        verifyNoInteractions(willComparisons);
    }

    @Test
    void locksVaultThenCase() {
        happyPath();

        service.classify(CASE_ID, legal, request(Route.COURT, "x"));

        InOrder order = inOrder(caseLookup, vaultRepository, caseRepository, dossiers);
        order.verify(caseLookup).findByPublicId(CASE_ID);
        order.verify(vaultRepository).findByIdForUpdate(VAULT_ID);
        order.verify(caseRepository).findByIdForUpdate(CASE_DB_ID);
        order.verify(dossiers).saveAndFlush(any(LegalBasisDossier.class));
    }
}
