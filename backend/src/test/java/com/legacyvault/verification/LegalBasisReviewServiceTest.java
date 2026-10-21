package com.legacyvault.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.LegalBasisReviewResponse;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.LegalBasisDossierVersion;
import com.legacyvault.verification.entity.LegalBasisReviewHistory;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.BasisVersionRow;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.LegalBasisReviewHistoryRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.LegalBasisReviewService;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

class LegalBasisReviewServiceTest {

    private static final Long DOSSIER_ID = 900L;
    private static final Long CASE_DB_ID = 500L;
    private static final Long VAULT_ID = 77L;
    private static final Long REVIEWER_ID = 25L;
    private static final UUID CASE_PUBLIC_ID = UUID.randomUUID();
    private static final UUID DOSSIER_PUBLIC_ID = UUID.randomUUID();
    private static final String HASH = "a".repeat(64);

    private static final class Fixture {
        final LegalBasisDossierRepository dossiers = mock(LegalBasisDossierRepository.class);
        final LegalBasisDossierVersionRepository versions =
                mock(LegalBasisDossierVersionRepository.class);
        final LegalBasisVersionAllocationRepository allocations =
                mock(LegalBasisVersionAllocationRepository.class);
        final LegalBasisReviewHistoryRepository history =
                mock(LegalBasisReviewHistoryRepository.class);
        final AuditService audit = mock(AuditService.class);
        final VerificationCaseRepository cases = mock(VerificationCaseRepository.class);
        final VaultRepository vaults = mock(VaultRepository.class);
        final LegalBasisReviewService service = new LegalBasisReviewService(
                dossiers, versions, allocations, history, audit, cases, vaults, mock(com.legacyvault.verification.service.LegalBasisLockedState.class));

        final LegalBasisDossier dossier = mock(LegalBasisDossier.class);
        final VerificationCase verificationCase = mock(VerificationCase.class);
        final Vault vault = mock(Vault.class);

        Fixture() {
            when(dossier.getLegalBasisDossierId()).thenReturn(DOSSIER_ID);
            when(dossier.getPublicId()).thenReturn(DOSSIER_PUBLIC_ID);
            when(dossier.getVerificationCaseId()).thenReturn(CASE_DB_ID);
            when(dossier.getStatus()).thenReturn(LegalBasisDossier.STATUS_FORWARDED);
            when(dossier.getRoute()).thenReturn("COURT");
            when(dossier.acceptsIntake()).thenReturn(true);
            when(dossier.getDisputeStatus()).thenReturn("NONE");
            when(dossier.getReviewStatus()).thenReturn("FRESH");
            when(dossier.getLastReviewedVersionNo()).thenReturn(1);
            when(dossier.getLastReviewedSha256Hash()).thenReturn(HASH);
            when(dossier.getLastReviewedDisputeStatus()).thenReturn("NONE");
            when(dossier.getLastReviewedAllocationHash())
                    .thenReturn(LegalBasisReviewService.allocationHashFromCanonicalValues(List.of()));
            when(verificationCase.getVerificationCaseId()).thenReturn(CASE_DB_ID);
            when(verificationCase.getPublicId()).thenReturn(CASE_PUBLIC_ID);
            when(verificationCase.getVaultId()).thenReturn(VAULT_ID);
            when(verificationCase.isOpen()).thenReturn(true);
            when(vault.getVaultId()).thenReturn(VAULT_ID);
            when(vault.getStatus()).thenReturn("LEGAL_BASIS_VERIFICATION");

            when(dossiers.findById(DOSSIER_ID)).thenReturn(Optional.of(dossier));
            when(cases.findById(CASE_DB_ID)).thenReturn(Optional.of(verificationCase));
            when(cases.findByPublicId(CASE_PUBLIC_ID)).thenReturn(Optional.of(verificationCase));
            when(vaults.findByIdForUpdate(VAULT_ID)).thenReturn(Optional.of(vault));
            when(cases.findByIdForUpdate(CASE_DB_ID)).thenReturn(Optional.of(verificationCase));
            when(dossiers.findByVerificationCaseIdForUpdate(CASE_DB_ID))
                    .thenReturn(Optional.of(dossier));
            when(dossiers.findByDossierIdForUpdate(DOSSIER_ID)).thenReturn(Optional.of(dossier));
            when(versions.findRows(DOSSIER_ID)).thenReturn(List.of(row(1, HASH)));
            when(allocations.findRowsByDossier(DOSSIER_ID)).thenReturn(List.of());
            when(versions.findByLegalBasisDossierIdAndVersionNo(DOSSIER_ID, 1))
                    .thenReturn(Optional.empty());
        }

        LegalBasisReviewResponse evaluate() {
            return service.evaluate(DOSSIER_ID);
        }
    }

    private static BasisVersionRow row(int version, String hash) {
        return new BasisVersionRow(
                version, "COURT_JUDGMENT", "Authority", "DOC-1",
                null, null, null, null, null, null, "application/pdf",
                100L, hash, "FORWARDED", REVIEWER_ID, null, null);
    }

    @Test
    void allocationHash_shouldBeIndependentOfInputOrder() {
        String first = LegalBasisReviewService.allocationHashFromCanonicalValues(
                List.of("asset-A|beneficiary-X|scope-1", "asset-B|beneficiary-Y|scope-2"));
        String second = LegalBasisReviewService.allocationHashFromCanonicalValues(
                List.of("asset-B|beneficiary-Y|scope-2", "asset-A|beneficiary-X|scope-1"));
        assertThat(first).isEqualTo(second);
    }

    @Test
    void evaluate_notarialHistoryUsesPs102CourtDecisionError() {
        Fixture f = new Fixture();
        when(f.dossier.getRoute()).thenReturn(LegalBasisDossier.ROUTE_NOTARIAL);
        when(f.dossier.acceptsIntake()).thenReturn(false);

        assertThatThrownBy(f::evaluate)
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.COURT_DECISION_REQUIRED);
        org.mockito.Mockito.verifyNoInteractions(f.history, f.audit);
    }

    @Test
    void allocationHash_shouldChangeWhenAllocationScopeChanges() {
        String before = LegalBasisReviewService.allocationHashFromCanonicalValues(
                List.of("asset-A|beneficiary-X|scope-1"));
        String after = LegalBasisReviewService.allocationHashFromCanonicalValues(
                List.of("asset-A|beneficiary-Y|scope-1"));
        assertThat(after).isNotEqualTo(before);
    }

    @Test
    void allocationHash_shouldChangeWhenAllocationIsAdded() {
        String before = LegalBasisReviewService.allocationHashFromCanonicalValues(
                List.of("asset-A|beneficiary-X|scope-1"));
        String after = LegalBasisReviewService.allocationHashFromCanonicalValues(
                List.of("asset-A|beneficiary-X|scope-1", "asset-B|beneficiary-Y|scope-2"));
        assertThat(after).isNotEqualTo(before);
    }

    @Test
    void evaluate_withoutSnapshot_marksReviewRequired_andPersistsHistoryAndAudit() {
        Fixture f = new Fixture();
        when(f.dossier.getLastReviewedVersionNo()).thenReturn(null);
        when(f.dossier.getLastReviewedSha256Hash()).thenReturn(null);
        when(f.dossier.getLastReviewedDisputeStatus()).thenReturn(null);
        when(f.dossier.getLastReviewedAllocationHash()).thenReturn(null);

        LegalBasisReviewResponse response = f.evaluate();

        assertThat(response.dossierId()).isEqualTo(DOSSIER_PUBLIC_ID);
        assertThat(response.dossierId()).isNotEqualTo(DOSSIER_ID);
        assertThat(response.reasonCode()).isEqualTo("NO_REVIEW_SNAPSHOT");

        ArgumentCaptor<LegalBasisReviewHistory> historyCaptor =
                ArgumentCaptor.forClass(LegalBasisReviewHistory.class);
        verify(f.history).save(historyCaptor.capture());
        assertThat(historyCaptor.getValue().getReasonCode()).isEqualTo("NO_REVIEW_SNAPSHOT");
        assertThat(historyCaptor.getValue().getVersionNo()).isEqualTo(1);

        ArgumentCaptor<AuditEvent> auditCaptor = ArgumentCaptor.forClass(AuditEvent.class);
        verify(f.audit).record(auditCaptor.capture());
        assertThat(auditCaptor.getValue().action()).isEqualTo(AuditAction.LEGAL_BASIS_REVIEW_REQUIRED);
        assertThat(auditCaptor.getValue().vaultId()).isEqualTo(VAULT_ID);
    }

    @Test
    void evaluate_detectsEachStaleSnapshotReason() {
        assertStaleReason("DOSSIER_VERSION_CHANGED", f -> {
            when(f.dossier.getLastReviewedVersionNo()).thenReturn(0);
        });
        assertStaleReason("EVIDENCE_HASH_CHANGED", f -> {
            when(f.dossier.getLastReviewedSha256Hash()).thenReturn("b".repeat(64));
        });
        assertStaleReason("DISPUTE_STATUS_CHANGED", f -> {
            when(f.dossier.getLastReviewedDisputeStatus()).thenReturn("DISPUTED");
        });
        assertStaleReason("ALLOCATION_SCOPE_CHANGED", f -> {
            when(f.dossier.getLastReviewedAllocationHash()).thenReturn("different-allocation-hash");
        });
    }

    private void assertStaleReason(String expectedReason, java.util.function.Consumer<Fixture> arrange) {
        Fixture f = new Fixture();
        arrange.accept(f);

        LegalBasisReviewResponse response = f.evaluate();

        assertThat(response.reviewRequired()).isTrue();
        assertThat(response.reasonCode()).isEqualTo(expectedReason);
        ArgumentCaptor<LegalBasisReviewHistory> captor =
                ArgumentCaptor.forClass(LegalBasisReviewHistory.class);
        verify(f.history).save(captor.capture());
        ArgumentCaptor<AuditEvent> auditCaptor =
                ArgumentCaptor.forClass(AuditEvent.class);
        verify(f.audit).record(auditCaptor.capture());
        assertThat(auditCaptor.getValue().action()).isEqualTo(AuditAction.LEGAL_BASIS_REVIEW_REQUIRED);
        assertThat(auditCaptor.getValue().vaultId()).isEqualTo(VAULT_ID);
    }

    @Test
    void evaluate_locksVaultThenCaseThenDossier() {
        Fixture f = new Fixture();

        f.evaluate();

        InOrder order = inOrder(f.vaults, f.cases, f.dossiers);
        order.verify(f.vaults).findByIdForUpdate(VAULT_ID);
        order.verify(f.cases).findByIdForUpdate(CASE_DB_ID);
        order.verify(f.dossiers).findByVerificationCaseIdForUpdate(CASE_DB_ID);
    }

    @Test
    void requestSupplementation_updatesDossierVaultHistoryAndAudit() {
        Fixture f = new Fixture();
        when(f.vault.getStatus()).thenReturn("LEGAL_BASIS_VERIFICATION");
        when(f.dossier.getStatus()).thenReturn(LegalBasisDossier.STATUS_FORWARDED);

        LegalBasisReviewResponse response = f.service.requestSupplementationByCasePublicId(
                CASE_PUBLIC_ID, REVIEWER_ID, "  Bổ sung giấy tờ còn thiếu  ");

        assertThat(response.dossierId()).isEqualTo(DOSSIER_PUBLIC_ID);
        assertThat(response.reasonCode()).isEqualTo("LEGAL_REQUESTED_SUPPLEMENTATION");
        assertThat(response.reviewRequired()).isTrue();
        verify(f.dossier).requireReview("LEGAL_REQUESTED_SUPPLEMENTATION");
        verify(f.dossier).markSupplementationRequired();
        verify(f.dossiers).save(f.dossier);
        verify(f.vault).markAwaitingLegalBasisAfterReviewHold();

        ArgumentCaptor<LegalBasisReviewHistory> historyCaptor =
                ArgumentCaptor.forClass(LegalBasisReviewHistory.class);
        verify(f.history).save(historyCaptor.capture());
        assertThat(historyCaptor.getValue().getReason())
                .isEqualTo("Bổ sung giấy tờ còn thiếu");
        assertThat(historyCaptor.getValue().getReviewedByUserId()).isEqualTo(REVIEWER_ID);

        ArgumentCaptor<AuditEvent> auditCaptor = ArgumentCaptor.forClass(AuditEvent.class);
        verify(f.audit).record(auditCaptor.capture());
        assertThat(auditCaptor.getValue().action()).isEqualTo(AuditAction.LEGAL_BASIS_REVIEW_REQUIRED);
        assertThat(auditCaptor.getValue().vaultId()).isEqualTo(VAULT_ID);
    }


    @Test
    void requestSupplementation_whenVaultOnHold_rejectsWithoutWritingHistoryOrAudit() {
        Fixture f = new Fixture();
        when(f.vault.getStatus()).thenReturn(Vault.STATUS_ON_HOLD);

        assertThatThrownBy(() -> f.service.requestSupplementationByCasePublicId(
                CASE_PUBLIC_ID, REVIEWER_ID, "Bổ sung giấy tờ"))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.LEGAL_WORKFLOW_ON_HOLD);

        org.mockito.Mockito.verifyNoInteractions(f.history, f.audit);
        org.mockito.Mockito.verify(f.dossiers, org.mockito.Mockito.never()).save(any());
        org.mockito.Mockito.verify(f.vault, org.mockito.Mockito.never())
                .markAwaitingLegalBasisAfterReviewHold();
    }

    @Test
    void completedReview_whenVaultOnHold_rejectsWithoutWritingHistoryOrAudit() {
        Fixture f = new Fixture();
        when(f.vault.getStatus()).thenReturn(Vault.STATUS_ON_HOLD);

        assertThatThrownBy(() -> f.service.recordCompletedReviewByCasePublicId(
                CASE_PUBLIC_ID, REVIEWER_ID, "Đã kiểm tra hồ sơ"))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.LEGAL_WORKFLOW_ON_HOLD);

        org.mockito.Mockito.verifyNoInteractions(f.history, f.audit);
        org.mockito.Mockito.verify(f.dossiers, org.mockito.Mockito.never()).save(any());
        org.mockito.Mockito.verify(f.dossier, org.mockito.Mockito.never())
                .recordReviewSnapshot(
                        org.mockito.ArgumentMatchers.anyInt(),
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void requestSupplementation_rejectsBlankReason_withoutWritingHistoryOrAudit() {
        Fixture f = new Fixture();

        assertThatThrownBy(() -> f.service.requestSupplementationByCasePublicId(
                CASE_PUBLIC_ID, REVIEWER_ID, "   "))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.VALIDATION_FAILED);

        org.mockito.Mockito.verifyNoInteractions(f.history, f.audit);
    }

    @Test
    void completedReview_persistsSnapshotHistoryAndAudit() {
        Fixture f = new Fixture();
        when(f.vault.getStatus()).thenReturn("LEGAL_BASIS_VERIFICATION");
        when(f.dossier.getStatus()).thenReturn(LegalBasisDossier.STATUS_FORWARDED);

        LegalBasisDossierVersion version = mock(LegalBasisDossierVersion.class);
        when(version.getDossierVersionId()).thenReturn(123L);
        when(f.versions.findByLegalBasisDossierIdAndVersionNo(DOSSIER_ID, 1))
                .thenReturn(Optional.of(version));

        LegalBasisReviewResponse response = f.service.recordCompletedReviewByCasePublicId(
                CASE_PUBLIC_ID, REVIEWER_ID, "  Đã kiểm tra hồ sơ  ");

        assertThat(response.dossierId()).isEqualTo(DOSSIER_PUBLIC_ID);
        assertThat(response.reviewStatus()).isEqualTo("FRESH");
        assertThat(response.reviewRequired()).isFalse();
        verify(f.dossier).recordReviewSnapshot(
                org.mockito.ArgumentMatchers.eq(1),
                org.mockito.ArgumentMatchers.eq(HASH),
                org.mockito.ArgumentMatchers.eq("NONE"),
                any(String.class),
                org.mockito.ArgumentMatchers.eq(REVIEWER_ID));
        verify(f.dossiers).save(f.dossier);

        ArgumentCaptor<LegalBasisReviewHistory> historyCaptor =
                ArgumentCaptor.forClass(LegalBasisReviewHistory.class);
        verify(f.history).save(historyCaptor.capture());
        assertThat(historyCaptor.getValue().getDossierVersionId()).isEqualTo(123L);
        assertThat(historyCaptor.getValue().getReasonCode()).isEqualTo("REVIEW_COMPLETED");
        assertThat(historyCaptor.getValue().getReason()).isEqualTo("Đã kiểm tra hồ sơ");
        assertThat(historyCaptor.getValue().getReviewedByUserId()).isEqualTo(REVIEWER_ID);

        ArgumentCaptor<AuditEvent> auditCaptor = ArgumentCaptor.forClass(AuditEvent.class);
        verify(f.audit).record(auditCaptor.capture());
        assertThat(auditCaptor.getValue().action()).isEqualTo(AuditAction.LEGAL_BASIS_REVIEW_RECORDED);
        assertThat(auditCaptor.getValue().vaultId()).isEqualTo(VAULT_ID);
        assertThat(auditCaptor.getValue().actorUserId()).isEqualTo(REVIEWER_ID);
    }

    @Test
    void evaluate_whenNoVersions_marksRequiredAndAuditsWithVaultId() {
        Fixture f = new Fixture();
        when(f.versions.findRows(DOSSIER_ID)).thenReturn(List.of());

        LegalBasisReviewResponse response = f.evaluate();

        assertThat(response.reasonCode()).isEqualTo("CURRENT_VERSION_UNAVAILABLE");
        ArgumentCaptor<AuditEvent> auditCaptor = ArgumentCaptor.forClass(AuditEvent.class);
        verify(f.audit).record(auditCaptor.capture());
        assertThat(auditCaptor.getValue().action()).isEqualTo(AuditAction.LEGAL_BASIS_REVIEW_REQUIRED);
        assertThat(auditCaptor.getValue().vaultId()).isEqualTo(VAULT_ID);
    }

    @Test
    void evaluateAfterChange_byCasePublicId_recordsAuditWithVaultId() {
        Fixture f = new Fixture();
        when(f.dossier.getLastReviewedVersionNo()).thenReturn(null);

        LegalBasisReviewResponse response = f.service.evaluateAfterChange(CASE_PUBLIC_ID);

        assertThat(response.reviewRequired()).isTrue();
        ArgumentCaptor<AuditEvent> auditCaptor = ArgumentCaptor.forClass(AuditEvent.class);
        verify(f.audit).record(auditCaptor.capture());
        assertThat(auditCaptor.getValue().action()).isEqualTo(AuditAction.LEGAL_BASIS_REVIEW_REQUIRED);
        assertThat(auditCaptor.getValue().vaultId()).isEqualTo(VAULT_ID);
    }

    @Test
    void evaluateAfterChange_byDossierIdAndVaultId_recordsAuditWithVaultId() {
        Fixture f = new Fixture();
        when(f.dossier.getLastReviewedVersionNo()).thenReturn(null);

        LegalBasisReviewResponse response = f.service.evaluateAfterChange(DOSSIER_ID, VAULT_ID);

        assertThat(response.reviewRequired()).isTrue();
        ArgumentCaptor<AuditEvent> auditCaptor = ArgumentCaptor.forClass(AuditEvent.class);
        verify(f.audit).record(auditCaptor.capture());
        assertThat(auditCaptor.getValue().action()).isEqualTo(AuditAction.LEGAL_BASIS_REVIEW_REQUIRED);
        assertThat(auditCaptor.getValue().vaultId()).isEqualTo(VAULT_ID);
    }
}

