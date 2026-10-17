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
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.data.domain.PageImpl;
import org.springframework.test.util.ReflectionTestUtils;

import com.legacyvault.asset.entity.Asset;
import com.legacyvault.asset.entity.AssetType;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.RecordWillComparisonRequest;
import com.legacyvault.verification.dto.RecordWillComparisonRequest.Result;
import com.legacyvault.verification.dto.WillComparisonOverviewResponse;
import com.legacyvault.verification.dto.WillComparisonResponse;
import com.legacyvault.verification.entity.OriginalWillIntake;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.entity.WillComparison;
import com.legacyvault.verification.repository.LegalCaseLookupRepository;
import com.legacyvault.verification.repository.OriginalWillIntakeRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.repository.WillComparisonRepository;
import com.legacyvault.verification.repository.WillComparisonRow;
import com.legacyvault.verification.service.WillComparisonService;
import com.legacyvault.will.repository.AssetVersionRepository;
import com.legacyvault.will.repository.WillAssetRepository;
import com.legacyvault.will.repository.WillVersionRef;
import com.legacyvault.will.repository.WillVersionView;

/** PS-40 (ST-15, LV-WILL-001): Legal ghi kết quả đối chiếu; hash lấy từ phiên bản đã lưu; MISMATCH chặn luồng duyệt. */
class WillComparisonServiceTest {

    private static final Long LEGAL_ID = 20L;
    private static final Long VAULT_ID = 77L;
    private static final Long CASE_DB_ID = 500L;
    private static final Long INTAKE_DB_ID = 600L;
    private static final Long WILL_DB_ID = 700L;
    private static final UUID CASE_ID = UUID.randomUUID();
    private static final UUID INTAKE_ID = UUID.randomUUID();
    private static final UUID WILL_ID = UUID.randomUUID();
    private static final String HASH = "a".repeat(64);

    private final LegalCaseLookupRepository caseLookup = mock(LegalCaseLookupRepository.class);
    private final VerificationCaseRepository caseRepository = mock(VerificationCaseRepository.class);
    private final VaultRepository vaultRepository = mock(VaultRepository.class);
    private final OriginalWillIntakeRepository intakeRepository = mock(OriginalWillIntakeRepository.class);
    private final WillAssetRepository willAssetRepository = mock(WillAssetRepository.class);
    private final AssetVersionRepository assetVersionRepository = mock(AssetVersionRepository.class);
    private final WillComparisonRepository comparisonRepository = mock(WillComparisonRepository.class);
    private final AuditService auditService = mock(AuditService.class);
    private final WillComparisonService service = new WillComparisonService(caseLookup, caseRepository,
            vaultRepository, intakeRepository, willAssetRepository, assetVersionRepository, comparisonRepository,
            auditService);

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

    private static OriginalWillIntake intake() {
        OriginalWillIntake i = new OriginalWillIntake(CASE_DB_ID, "Nguyễn Văn A", null, 10L, "BB-07", null);
        ReflectionTestUtils.setField(i, "originalWillIntakeId", INTAKE_DB_ID);
        ReflectionTestUtils.setField(i, "publicId", INTAKE_ID);
        ReflectionTestUtils.setField(i, "receivedAt", LocalDateTime.of(2026, 10, 3, 9, 0));
        return i;
    }

    private static Asset will() {
        Asset a = new Asset(VAULT_ID, AssetType.DOCUMENT, "di-chuc.pdf", null);
        ReflectionTestUtils.setField(a, "assetId", WILL_DB_ID);
        ReflectionTestUtils.setField(a, "publicId", WILL_ID);
        return a;
    }

    private static RecordWillComparisonRequest request(Result result, String reason) {
        return new RecordWillComparisonRequest(INTAKE_ID, WILL_ID, 2, result, reason);
    }

    private static ErrorCode codeOf(Throwable ex) {
        return ((BusinessException) ex).getErrorCode();
    }

    /** Dựng toàn bộ dữ liệu hợp lệ để ghi nhận: ca mở, Vault DOCUMENT_VERIFICATION, intake, di chúc, phiên bản 2. */
    private void happyPathData() {
        when(caseLookup.findByPublicId(CASE_ID)).thenReturn(Optional.of(openCase()));
        when(vaultRepository.findByIdForUpdate(VAULT_ID)).thenReturn(Optional.of(vault("DOCUMENT_VERIFICATION")));
        when(caseRepository.findByIdForUpdate(CASE_DB_ID)).thenReturn(Optional.of(openCase()));
        when(intakeRepository.findByPublicIdAndVerificationCaseId(INTAKE_ID, CASE_DB_ID))
                .thenReturn(Optional.of(intake()));
        when(willAssetRepository.findWill(WILL_ID, VAULT_ID)).thenReturn(Optional.of(will()));
        when(assetVersionRepository.findRef(WILL_DB_ID, 2)).thenReturn(Optional.of(new WillVersionRef(800L, 2, HASH)));
        when(comparisonRepository.saveAndFlush(any(WillComparison.class))).thenAnswer(inv -> {
            WillComparison c = inv.getArgument(0);
            ReflectionTestUtils.setField(c, "willComparisonId", 900L);
            ReflectionTestUtils.setField(c, "publicId", UUID.randomUUID());
            ReflectionTestUtils.setField(c, "comparedAt", LocalDateTime.of(2026, 10, 4, 10, 0));
            return c;
        });
    }

    @Test
    void match_savesVersionHashFromStoredData_andAuditsWithoutReason() {
        happyPathData();

        WillComparisonResponse response = service.record(CASE_ID, legal, request(Result.MATCH, "  "));

        ArgumentCaptor<WillComparison> saved = ArgumentCaptor.forClass(WillComparison.class);
        verify(comparisonRepository).saveAndFlush(saved.capture());
        WillComparison c = saved.getValue();
        assertThat(c.getVerificationCaseId()).isEqualTo(CASE_DB_ID);
        assertThat(c.getOriginalWillIntakeId()).isEqualTo(INTAKE_DB_ID);
        assertThat(c.getAssetVersionId()).isEqualTo(800L);
        assertThat(c.getReferencedSha256Hash()).isEqualTo(HASH);
        assertThat(c.getComparisonResult()).isEqualTo("MATCH");
        assertThat(c.getCheckedByUserId()).isEqualTo(LEGAL_ID);
        assertThat(c.getReason()).isNull();

        assertThat(response.result()).isEqualTo("MATCH");
        assertThat(response.sha256()).isEqualTo(HASH);
        assertThat(response.version()).isEqualTo(2);
        assertThat(response.willId()).isEqualTo(WILL_ID);
        assertThat(response.originalWillIntakeId()).isEqualTo(INTAKE_ID);
        assertThat(response.checkedBy()).isEqualTo(legal.publicId());

        ArgumentCaptor<AuditEvent> audit = ArgumentCaptor.forClass(AuditEvent.class);
        verify(auditService).record(audit.capture());
        AuditEvent event = audit.getValue();
        assertThat(event.action()).isEqualTo(AuditAction.WILL_COMPARISON_RECORDED);
        assertThat(event.actorUserId()).isEqualTo(LEGAL_ID);
        assertThat(event.vaultId()).isEqualTo(VAULT_ID);
        assertThat(event.stepId()).isEqualTo("ST-15");
        assertThat(event.ruleId()).isEqualTo("LV-WILL-001");
        assertThat(event.context()).containsEntry("result", "MATCH").containsEntry("sha256", HASH)
                .containsEntry("version", 2);
    }

    @Test
    void mismatch_withReason_isRecorded_andDoesNotTouchVaultState() {
        happyPathData();
        Vault vault = vault("DOCUMENT_VERIFICATION");
        when(vaultRepository.findByIdForUpdate(VAULT_ID)).thenReturn(Optional.of(vault));

        WillComparisonResponse response = service.record(CASE_ID, legal,
                request(Result.MISMATCH, "  Trang 3 khác bản scan  "));

        assertThat(response.result()).isEqualTo("MISMATCH");
        assertThat(response.reason()).isEqualTo("Trang 3 khác bản scan");
        assertThat(vault.getStatus()).isEqualTo("DOCUMENT_VERIFICATION");
        ArgumentCaptor<AuditEvent> audit = ArgumentCaptor.forClass(AuditEvent.class);
        verify(auditService).record(audit.capture());
        assertThat(audit.getValue().context().toString()).doesNotContain("Trang 3");
    }

    @Test
    void mismatchOrInconclusive_withoutReason_isRejected_andWritesNothing() {
        assertThatThrownBy(() -> service.record(CASE_ID, legal, request(Result.MISMATCH, null)))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.VALIDATION_FAILED));
        assertThatThrownBy(() -> service.record(CASE_ID, legal, request(Result.INCONCLUSIVE, "   ")))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.VALIDATION_FAILED));
        assertThatThrownBy(() -> service.record(CASE_ID, legal, request(Result.MISMATCH, "x".repeat(1001))))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.VALIDATION_FAILED));
        verifyNoInteractions(comparisonRepository, auditService, caseLookup);
    }

    @Test
    void record_withoutAuthenticatedPrincipal_isUnauthenticated() {
        assertThatThrownBy(() -> service.record(CASE_ID, null, request(Result.MATCH, null)))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.UNAUTHENTICATED));
        verifyNoInteractions(caseLookup, comparisonRepository, auditService);
    }

    @Test
    void record_locksVaultThenCase_beforeReadingEvidence() {
        happyPathData();

        service.record(CASE_ID, legal, request(Result.MATCH, null));

        InOrder order = inOrder(caseLookup, vaultRepository, caseRepository, intakeRepository);
        order.verify(caseLookup).findByPublicId(CASE_ID);
        order.verify(vaultRepository).findByIdForUpdate(VAULT_ID);
        order.verify(caseRepository).findByIdForUpdate(CASE_DB_ID);
        order.verify(intakeRepository).findByPublicIdAndVerificationCaseId(INTAKE_ID, CASE_DB_ID);
    }

    @Test
    void record_unknownCase_isNotFound() {
        when(caseLookup.findByPublicId(CASE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.record(CASE_ID, legal, request(Result.MATCH, null)))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
        verify(comparisonRepository, never()).saveAndFlush(any());
    }

    @Test
    void record_whenCaseCancelledOrVaultNotInDocumentVerification_isConflict() {
        happyPathData();
        VerificationCase cancelled = openCase();
        cancelled.cancel(LocalDateTime.of(2026, 10, 2, 8, 0));
        when(caseRepository.findByIdForUpdate(CASE_DB_ID)).thenReturn(Optional.of(cancelled));
        assertThatThrownBy(() -> service.record(CASE_ID, legal, request(Result.MATCH, null)))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.LEGAL_VERIFICATION_INVALID_STATE));

        when(caseRepository.findByIdForUpdate(CASE_DB_ID)).thenReturn(Optional.of(openCase()));
        for (String status : List.of("AWAITING_VERIFICATION", "ACTIVE", "UNLOCKED")) {
            when(vaultRepository.findByIdForUpdate(VAULT_ID)).thenReturn(Optional.of(vault(status)));
            assertThatThrownBy(() -> service.record(CASE_ID, legal, request(Result.MATCH, null)))
                    .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.LEGAL_VERIFICATION_INVALID_STATE));
        }
        verify(comparisonRepository, never()).saveAndFlush(any());
        verifyNoInteractions(auditService);
    }

    @Test
    void record_intakeWillOrVersionNotInThisCase_isNotFound() {
        happyPathData();
        when(intakeRepository.findByPublicIdAndVerificationCaseId(INTAKE_ID, CASE_DB_ID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.record(CASE_ID, legal, request(Result.MATCH, null)))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));

        happyPathData();
        when(willAssetRepository.findWill(WILL_ID, VAULT_ID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.record(CASE_ID, legal, request(Result.MATCH, null)))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));

        happyPathData();
        when(assetVersionRepository.findRef(WILL_DB_ID, 2)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.record(CASE_ID, legal, request(Result.MATCH, null)))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
        verify(comparisonRepository, never()).saveAndFlush(any());
    }

    private void latestComparison(String result) {
        WillComparison c = new WillComparison(CASE_DB_ID, INTAKE_DB_ID, 800L, HASH, result, LEGAL_ID, "lý do");
        when(comparisonRepository.findFirstByVerificationCaseIdOrderByComparedAtDescWillComparisonIdDesc(CASE_DB_ID))
                .thenReturn(Optional.of(c));
    }

    @Test
    void approvalIsBlockedUnlessLatestComparisonIsMatch() {
        when(comparisonRepository.findFirstByVerificationCaseIdOrderByComparedAtDescWillComparisonIdDesc(CASE_DB_ID))
                .thenReturn(Optional.empty());
        assertThat(service.isApprovalBlocked(CASE_DB_ID)).as("chưa đối chiếu").isTrue();

        latestComparison("MISMATCH");
        assertThat(service.isApprovalBlocked(CASE_DB_ID)).as("MISMATCH").isTrue();

        latestComparison("INCONCLUSIVE");
        assertThat(service.isApprovalBlocked(CASE_DB_ID)).as("INCONCLUSIVE").isTrue();

        latestComparison("MATCH");
        assertThat(service.isApprovalBlocked(CASE_DB_ID)).as("MATCH").isFalse();
    }

    @Test
    void overview_reportsLatestResultAndBlockedFlag_withPublicIdsOnly() {
        when(caseLookup.findByPublicId(CASE_ID)).thenReturn(Optional.of(openCase()));
        when(vaultRepository.findById(VAULT_ID)).thenReturn(Optional.of(vault("DOCUMENT_VERIFICATION")));
        when(intakeRepository.findByVerificationCaseIdOrderByReceivedAtDescOriginalWillIntakeIdDesc(CASE_DB_ID))
                .thenReturn(List.of(intake()));
        when(willAssetRepository.findWills(any(Long.class), any())).thenReturn(new PageImpl<>(List.of(will())));
        when(assetVersionRepository.findVersions(WILL_DB_ID)).thenReturn(List.of(new WillVersionView(WILL_DB_ID, 2,
                "di-chuc.pdf", "application/pdf", 1234L, HASH, "UPLOADED", LocalDateTime.of(2026, 10, 1, 9, 0))));
        LocalDateTime t = LocalDateTime.of(2026, 10, 4, 10, 0);
        when(comparisonRepository.findRowsByCase(CASE_DB_ID)).thenReturn(List.of(
                new WillComparisonRow(UUID.randomUUID(), INTAKE_ID, WILL_ID, 2, HASH, "MISMATCH", legal.publicId(),
                        "khác", t),
                new WillComparisonRow(UUID.randomUUID(), INTAKE_ID, WILL_ID, 1, "b".repeat(64), "MATCH",
                        legal.publicId(), null, t.minusDays(1))));

        WillComparisonOverviewResponse response = service.overview(CASE_ID);

        assertThat(response.caseId()).isEqualTo(CASE_ID);
        assertThat(response.vaultStatus()).isEqualTo("DOCUMENT_VERIFICATION");
        assertThat(response.latestResult()).isEqualTo("MISMATCH");
        assertThat(response.approvalBlocked()).isTrue();
        assertThat(response.originalWillIntakes()).extracting(WillComparisonOverviewResponse.OriginalIntake::id)
                .containsExactly(INTAKE_ID);
        assertThat(response.wills()).hasSize(1);
        assertThat(response.wills().get(0).id()).isEqualTo(WILL_ID);
        assertThat(response.wills().get(0).versions().get(0).sha256()).isEqualTo(HASH);
        assertThat(response.comparisons()).hasSize(2);
        assertThat(response.comparisons().get(0).comparedAt().toString()).endsWith("Z");
    }

    @Test
    void overview_withoutAnyComparison_isBlocked_andUnknownCaseIsNotFound() {
        when(caseLookup.findByPublicId(CASE_ID)).thenReturn(Optional.of(openCase()));
        when(vaultRepository.findById(VAULT_ID)).thenReturn(Optional.of(vault("DOCUMENT_VERIFICATION")));
        when(intakeRepository.findByVerificationCaseIdOrderByReceivedAtDescOriginalWillIntakeIdDesc(CASE_DB_ID))
                .thenReturn(List.of());
        when(willAssetRepository.findWills(any(Long.class), any())).thenReturn(new PageImpl<>(List.of()));
        when(comparisonRepository.findRowsByCase(CASE_DB_ID)).thenReturn(List.of());

        WillComparisonOverviewResponse response = service.overview(CASE_ID);
        assertThat(response.approvalBlocked()).isTrue();
        assertThat(response.latestResult()).isNull();

        when(caseLookup.findByPublicId(CASE_ID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.overview(CASE_ID))
                .satisfies(ex -> assertThat(codeOf(ex)).isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));
    }

    @Test
    void firstMatch_movesVaultToWillVerification_perST15() {
        happyPathData();
        Vault vault = vault("DOCUMENT_VERIFICATION");
        when(vaultRepository.findByIdForUpdate(VAULT_ID)).thenReturn(Optional.of(vault));

        service.record(CASE_ID, legal, request(Result.MATCH, null));

        assertThat(vault.getStatus()).isEqualTo("WILL_VERIFICATION");
        ArgumentCaptor<AuditEvent> audit = ArgumentCaptor.forClass(AuditEvent.class);
        verify(auditService).record(audit.capture());
        assertThat(audit.getValue().context()).containsEntry("vaultStatusBefore", "DOCUMENT_VERIFICATION")
                .containsEntry("vaultStatusAfter", "WILL_VERIFICATION");
    }

    @Test
    void recompareAllowedInWillVerification_andMismatchOrInconclusiveNeverMoveTheVault() {
        happyPathData();
        Vault vault = vault("WILL_VERIFICATION");
        when(vaultRepository.findByIdForUpdate(VAULT_ID)).thenReturn(Optional.of(vault));

        service.record(CASE_ID, legal, request(Result.MATCH, null));
        assertThat(vault.getStatus()).isEqualTo("WILL_VERIFICATION");

        Vault documentVault = vault("DOCUMENT_VERIFICATION");
        when(vaultRepository.findByIdForUpdate(VAULT_ID)).thenReturn(Optional.of(documentVault));
        service.record(CASE_ID, legal, request(Result.INCONCLUSIVE, "chưa đủ cơ sở"));
        service.record(CASE_ID, legal, request(Result.MISMATCH, "khác"));
        assertThat(documentVault.getStatus()).isEqualTo("DOCUMENT_VERIFICATION");
    }
}
