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

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.asset.entity.Asset;
import com.legacyvault.asset.entity.AssetType;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.beneficiary.Beneficiary;
import com.legacyvault.beneficiary.BeneficiaryRepository;
import com.legacyvault.common.crypto.EncryptedData;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.AllocationInput;
import com.legacyvault.verification.dto.BasisIntakeMetadata;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.LegalBasisDossierVersion;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.BasisDossierViewService;
import com.legacyvault.verification.service.BasisIntakeService;
import com.legacyvault.verification.service.LegalBasisReviewService;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mockito;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * PS-41 (ST-18, LV-BASIS-001).
 * Kiểm thử Staff tiếp nhận căn cứ pháp lý, mã hóa tệp, tạo phiên bản,
 * lưu phạm vi phân bổ và ghi audit.
 */
class BasisIntakeServiceTest {

    private static final Long STAFF_ID = 10L;
    private static final Long VAULT_ID = 77L;
    private static final Long CASE_DB_ID = 500L;
    private static final Long DOSSIER_DB_ID = 900L;
    private static final long MAX_FILE_BYTES = 10 * 1024 * 1024;

    private static final UUID CASE_ID = UUID.randomUUID();
    private static final UUID ASSET_ID = UUID.randomUUID();
    private static final UUID BENEFICIARY_ID = UUID.randomUUID();

    private static final byte[] PDF =
            "%PDF-1.7\nvan ban phan chia di san".getBytes(StandardCharsets.US_ASCII);

    private final StaffCaseLockRepository staffCases =
            mock(StaffCaseLockRepository.class);
    private final VerificationCaseRepository caseRepository =
            mock(VerificationCaseRepository.class);
    private final VaultRepository vaultRepository =
            mock(VaultRepository.class);
    private final LegalBasisDossierRepository dossiers =
            mock(LegalBasisDossierRepository.class);
    private final LegalBasisDossierVersionRepository versions =
            mock(LegalBasisDossierVersionRepository.class);
    private final LegalBasisVersionAllocationRepository allocationRepository =
            mock(LegalBasisVersionAllocationRepository.class);
    private final AssetRepository assets =
            mock(AssetRepository.class);
    private final BeneficiaryRepository beneficiaries =
            mock(BeneficiaryRepository.class);

    private final EncryptionService encryption = new EncryptionService(
            Base64.getEncoder().encodeToString(new byte[32]),
            "v1"
    );

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final BasisDossierViewService views =
            mock(BasisDossierViewService.class);
    private final AuditService auditService =
            mock(AuditService.class);
    private final LegalBasisReviewService reviewService =
            mock(LegalBasisReviewService.class);

    private final BasisIntakeService service = new BasisIntakeService(
            staffCases,
            caseRepository,
            vaultRepository,
            dossiers,
            versions,
            allocationRepository,
            assets,
            beneficiaries,
            encryption,
            objectMapper,
            views,
            auditService,
            reviewService,
            MAX_FILE_BYTES
    );

    private final CustomUserPrincipal staff = new CustomUserPrincipal(
            STAFF_ID,
            UUID.randomUUID(),
            "staff@example.com"
    );

    private static VerificationCase openCase() {
        VerificationCase verificationCase = new VerificationCase(
                VAULT_ID,
                LocalDateTime.of(2026, 10, 1, 8, 0),
                null
        );

        ReflectionTestUtils.setField(
                verificationCase, "verificationCaseId", CASE_DB_ID
        );
        ReflectionTestUtils.setField(
                verificationCase, "publicId", CASE_ID
        );
        ReflectionTestUtils.setField(
                verificationCase, "assignedStaffUserId", STAFF_ID
        );

        return verificationCase;
    }

    private static Vault vault(String status) {
        Vault vault = new Vault();

        ReflectionTestUtils.setField(vault, "vaultId", VAULT_ID);
        ReflectionTestUtils.setField(vault, "status", status);

        return vault;
    }

    private static LegalBasisDossier dossier(String route) {
        LegalBasisDossier dossier = new LegalBasisDossier(
                CASE_DB_ID,
                route,
                "lý do",
                "NONE",
                20L
        );

        ReflectionTestUtils.setField(
                dossier, "legalBasisDossierId", DOSSIER_DB_ID
        );
        ReflectionTestUtils.setField(
                dossier, "publicId", UUID.randomUUID()
        );

        return dossier;
    }

    private static BasisIntakeMetadata metadata(String type) {
        return new BasisIntakeMetadata(
                type,
                "  Phòng công chứng số 1  ",
                " 045/2026 ",
                LocalDate.of(2026, 9, 20),
                "  Văn phòng công chứng A  ",
                " CC-001 ",
                LocalDate.of(2026, 9, 19),
                "  BB-12  ",
                "  ghi chú nội bộ  ",
                List.of(new AllocationInput(
                        ASSET_ID,
                        BENEFICIARY_ID,
                        "toàn bộ"
                ))
        );
    }

    private static BasisIntakeMetadata metadataWith(
            List<AllocationInput> allocations
    ) {
        BasisIntakeMetadata base = metadata("NOTARIAL_PARTITION");

        return new BasisIntakeMetadata(
                base.legalBasisType(),
                base.issuingAuthority(),
                base.documentNumber(),
                base.issueDate(),
                base.notaryAuthority(),
                base.notarialDocumentNumber(),
                base.notarizedAt(),
                null,
                null,
                allocations
        );
    }

    private static MockMultipartFile pdf() {
        return new MockMultipartFile(
                "file",
                "scan/van-ban.pdf",
                "application/pdf",
                PDF
        );
    }

    private static ErrorCode codeOf(Throwable exception) {
        return ((BusinessException) exception).getErrorCode();
    }

    /**
     * Chuẩn bị các mock cho luồng hợp lệ.
     * Thứ tự truy vấn theo thiết kế: tìm ca → khóa Vault → khóa Case → khóa Dossier.
     */
    private Vault happyPath(String route) {
        VerificationCase verificationCase = openCase();
        Vault vault = vault("AWAITING_LEGAL_BASIS");

        when(staffCases.findOwnedByStaff(CASE_ID, STAFF_ID))
                .thenReturn(Optional.of(verificationCase));
        when(vaultRepository.findByIdForUpdate(VAULT_ID))
                .thenReturn(Optional.of(vault));
        when(caseRepository.findByIdForUpdate(CASE_DB_ID))
                .thenReturn(Optional.of(verificationCase));
        when(dossiers.findByVerificationCaseIdForUpdate(CASE_DB_ID))
                .thenReturn(Optional.of(dossier(route)));
        when(versions.findMaxVersionNo(DOSSIER_DB_ID))
                .thenReturn(0);
        when(versions.saveAndFlush(any(LegalBasisDossierVersion.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        Asset asset = new Asset(
                VAULT_ID,
                AssetType.TEXT,
                "Tài khoản",
                null
        );
        ReflectionTestUtils.setField(asset, "assetId", 31L);

        when(assets.findByPublicIdAndVaultIdAndAssetTypeNot(
                ASSET_ID,
                VAULT_ID,
                AssetType.DOCUMENT
        )).thenReturn(Optional.of(asset));

        Beneficiary beneficiary = mock(Beneficiary.class);
        when(beneficiary.getId()).thenReturn(41L);

        when(beneficiaries.findByPublicIdAndVault_VaultId(
                BENEFICIARY_ID,
                VAULT_ID
        )).thenReturn(Optional.of(beneficiary));

        return vault;
    }

    @Test
    void notarialIntake_storesHashAndEncryptedContent_setsStatusProvided_andAuditsWithoutDocumentData() {
        happyPath("NOTARIAL");

        LegalBasisDossier dossier = dossier("NOTARIAL");
        when(dossiers.findByVerificationCaseIdForUpdate(CASE_DB_ID))
                .thenReturn(Optional.of(dossier));

        service.intake(CASE_ID, staff, metadata("NOTARIAL_PARTITION"), pdf());

        ArgumentCaptor<LegalBasisDossierVersion> saved =
                ArgumentCaptor.forClass(LegalBasisDossierVersion.class);

        verify(versions).saveAndFlush(saved.capture());

        LegalBasisDossierVersion version = saved.getValue();

        assertThat(version.getVersionNo()).isEqualTo(1);
        assertThat(version.getSha256Hash())
                .hasSize(64)
                .matches("[0-9a-f]{64}");

        assertThat(ReflectionTestUtils.getField(version, "fileReference"))
                .isEqualTo("dossier-version:" + version.getPublicId());
        assertThat(ReflectionTestUtils.getField(version, "issuingAuthority"))
                .isEqualTo("Phòng công chứng số 1");
        assertThat(ReflectionTestUtils.getField(version, "documentNumber"))
                .isEqualTo("045/2026");
        assertThat(ReflectionTestUtils.getField(version, "versionNotes"))
                .isEqualTo("ghi chú nội bộ");
        assertThat((String) ReflectionTestUtils.getField(version, "evidenceMetadata"))
                .contains("BB-12");
        assertThat(ReflectionTestUtils.getField(version, "contentType"))
                .isEqualTo("application/pdf");
        assertThat(ReflectionTestUtils.getField(version, "originalFileName"))
                .isEqualTo("van-ban.pdf");
        assertThat(version.getCreatedAt()).isNull();

        EncryptedData encryptedData = new EncryptedData(
                (byte[]) ReflectionTestUtils.getField(version, "encryptedFileContent"),
                (byte[]) ReflectionTestUtils.getField(version, "encryptionIv"),
                (String) ReflectionTestUtils.getField(version, "encryptionKeyVersion")
        );

        assertThat(encryptedData.ciphertext()).isNotEqualTo(PDF);

        byte[] associatedData = (
                "LEGAL_BASIS_VERSION:" + version.getPublicId()
        ).getBytes(StandardCharsets.UTF_8);

        assertThat(encryption.decryptBytes(encryptedData, associatedData))
                .isEqualTo(PDF);

        assertThat(dossier.getStatus()).isEqualTo("LEGAL_BASIS_PROVIDED");

        ArgumentCaptor<AuditEvent> audit =
                ArgumentCaptor.forClass(AuditEvent.class);
        verify(auditService).record(audit.capture());

        AuditEvent event = audit.getValue();

        assertThat(event.action()).isEqualTo(AuditAction.LEGAL_BASIS_RECEIVED);
        assertThat(event.stepId()).isEqualTo("ST-18");
        assertThat(event.ruleId()).isEqualTo("LV-BASIS-001");
        assertThat(event.context())
                .containsEntry("legalBasisType", "NOTARIAL_PARTITION")
                .containsEntry("sha256", version.getSha256Hash())
                .containsEntry("version", 1);
        assertThat(event.context().toString())
                .doesNotContain(
                        "045/2026",
                        "Phòng công chứng",
                        "ghi chú",
                        "van-ban"
                );
    }

    @Test
    void intakeLocksVaultThenCaseThenDossier() {
        happyPath("NOTARIAL");

        service.intake(
                CASE_ID,
                staff,
                metadata("NOTARIAL_PARTITION"),
                pdf()
        );

        InOrder order = inOrder(
                staffCases,
                vaultRepository,
                caseRepository,
                dossiers
        );

        order.verify(staffCases).findOwnedByStaff(CASE_ID, STAFF_ID);
        order.verify(vaultRepository).findByIdForUpdate(VAULT_ID);
        order.verify(caseRepository).findByIdForUpdate(CASE_DB_ID);
        order.verify(dossiers).findByVerificationCaseIdForUpdate(CASE_DB_ID);
    }

    @Test
    void courtDossierAcceptsJudgmentOrDecision_butNotNotarialType() {
        happyPath("COURT");
        service.intake(CASE_ID, staff, metadata("COURT_JUDGMENT"), pdf());

        happyPath("COURT");
        service.intake(CASE_ID, staff, metadata("COURT_DECISION"), pdf());

        happyPath("COURT");
        assertThatThrownBy(() -> service.intake(
                CASE_ID,
                staff,
                metadata("NOTARIAL_PARTITION"),
                pdf()
        )).satisfies(exception ->
                assertThat(codeOf(exception))
                        .isEqualTo(ErrorCode.VALIDATION_FAILED));

        happyPath("NOTARIAL");
        assertThatThrownBy(() -> service.intake(
                CASE_ID,
                staff,
                metadata("COURT_JUDGMENT"),
                pdf()
        )).satisfies(exception ->
                assertThat(codeOf(exception))
                        .isEqualTo(ErrorCode.VALIDATION_FAILED));
    }

    @Test
    void notarialIntake_requiresNotaryAuthorityNumberAndDate() {
        BasisIntakeMetadata base = metadata("NOTARIAL_PARTITION");

        BasisIntakeMetadata[] incomplete = {
                new BasisIntakeMetadata(
                        base.legalBasisType(),
                        base.issuingAuthority(),
                        base.documentNumber(),
                        base.issueDate(),
                        null,
                        base.notarialDocumentNumber(),
                        base.notarizedAt(),
                        null,
                        null,
                        base.allocations()
                ),
                new BasisIntakeMetadata(
                        base.legalBasisType(),
                        base.issuingAuthority(),
                        base.documentNumber(),
                        base.issueDate(),
                        base.notaryAuthority(),
                        "  ",
                        base.notarizedAt(),
                        null,
                        null,
                        base.allocations()
                ),
                new BasisIntakeMetadata(
                        base.legalBasisType(),
                        base.issuingAuthority(),
                        base.documentNumber(),
                        base.issueDate(),
                        base.notaryAuthority(),
                        base.notarialDocumentNumber(),
                        null,
                        null,
                        null,
                        base.allocations()
                )
        };

        for (BasisIntakeMetadata metadata : incomplete) {
            happyPath("NOTARIAL");

            assertThatThrownBy(() -> service.intake(
                    CASE_ID,
                    staff,
                    metadata,
                    pdf()
            )).satisfies(exception ->
                    assertThat(codeOf(exception))
                            .isEqualTo(ErrorCode.VALIDATION_FAILED));
        }

        verify(versions, never()).saveAndFlush(any());
    }

    @Test
    void caseNotOwnedByStaffOrWithoutDossier_isNotFound() {
        when(staffCases.findOwnedByStaff(CASE_ID, STAFF_ID))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.intake(
                CASE_ID,
                staff,
                metadata("NOTARIAL_PARTITION"),
                pdf()
        )).satisfies(exception ->
                assertThat(codeOf(exception))
                        .isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));

        happyPath("NOTARIAL");
        when(dossiers.findByVerificationCaseIdForUpdate(CASE_DB_ID))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.intake(
                CASE_ID,
                staff,
                metadata("NOTARIAL_PARTITION"),
                pdf()
        )).satisfies(exception ->
                assertThat(codeOf(exception))
                        .isEqualTo(ErrorCode.RESOURCE_NOT_FOUND));

        verify(versions, never()).saveAndFlush(any());
        verifyNoInteractions(auditService);
    }

    @Test
    void wrongStates_areConflict() {
        // Case đã hủy phải trả về VERIFICATION_CASE_NOT_OPEN.
        happyPath("NOTARIAL");

        VerificationCase cancelled = openCase();
        cancelled.cancel(LocalDateTime.of(2026, 10, 2, 8, 0));

        when(caseRepository.findByIdForUpdate(CASE_DB_ID))
                .thenReturn(Optional.of(cancelled));

        assertThatThrownBy(() -> service.intake(
                CASE_ID,
                staff,
                metadata("NOTARIAL_PARTITION"),
                pdf()
        )).satisfies(exception ->
                assertThat(codeOf(exception))
                        .isEqualTo(ErrorCode.VERIFICATION_CASE_NOT_OPEN));

        // Vault ở trạng thái không cho phép tiếp nhận phải bị từ chối.
        for (String status : new String[]{
                "ON_HOLD",
                "WILL_VERIFICATION",
                "LEGAL_BASIS_VERIFICATION"
        }) {
            happyPath("NOTARIAL");

            when(vaultRepository.findByIdForUpdate(VAULT_ID))
                    .thenReturn(Optional.of(vault(status)));

            assertThatThrownBy(() -> service.intake(
                    CASE_ID,
                    staff,
                    metadata("NOTARIAL_PARTITION"),
                    pdf()
            )).satisfies(exception ->
                    assertThat(codeOf(exception))
                            .isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE));
        }

        // Dossier đang ON_HOLD cũng không được tiếp nhận.
        happyPath("ON_HOLD");

        assertThatThrownBy(() -> service.intake(
                CASE_ID,
                staff,
                metadata("NOTARIAL_PARTITION"),
                pdf()
        )).satisfies(exception ->
                assertThat(codeOf(exception))
                        .isEqualTo(ErrorCode.BASIS_DOSSIER_INVALID_STATE));

        verify(versions, never()).saveAndFlush(any());
    }

    @Test
    void badFile_isRejected_beforeAnythingIsSaved() {
        happyPath("NOTARIAL");

        assertThatThrownBy(() -> service.intake(
                CASE_ID,
                staff,
                metadata("NOTARIAL_PARTITION"),
                null
        )).satisfies(exception ->
                assertThat(codeOf(exception))
                        .isEqualTo(ErrorCode.VALIDATION_FAILED));

        MockMultipartFile exe = new MockMultipartFile(
                "file",
                "a.pdf",
                "application/pdf",
                "MZ-not-a-pdf".getBytes(StandardCharsets.US_ASCII)
        );

        assertThatThrownBy(() -> service.intake(
                CASE_ID,
                staff,
                metadata("NOTARIAL_PARTITION"),
                exe
        )).satisfies(exception ->
                assertThat(codeOf(exception))
                        .isEqualTo(ErrorCode.UNSUPPORTED_MEDIA_TYPE));

        verify(versions, never()).saveAndFlush(any());
        verifyNoInteractions(auditService);
    }

    @Test
    void missingMetadata_isValidationError() {
        assertThatThrownBy(() -> service.intake(
                CASE_ID,
                staff,
                null,
                pdf()
        )).satisfies(exception ->
                assertThat(codeOf(exception))
                        .isEqualTo(ErrorCode.VALIDATION_FAILED));

        verifyNoInteractions(
                staffCases,
                caseRepository,
                vaultRepository,
                dossiers,
                versions,
                auditService
        );
    }

    @Test
    void withoutAuthenticatedPrincipal_isUnauthenticated() {
        assertThatThrownBy(() -> service.intake(
                CASE_ID,
                null,
                metadata("NOTARIAL_PARTITION"),
                pdf()
        )).satisfies(exception ->
                assertThat(codeOf(exception))
                        .isEqualTo(ErrorCode.UNAUTHENTICATED));

        verifyNoInteractions(
                staffCases,
                caseRepository,
                vaultRepository,
                dossiers,
                versions,
                auditService
        );
    }

    @Test
    void secondVersion_isNewRecord_withNextNumber_andOwnScope_oldVersionsUntouched() {
        happyPath("NOTARIAL");

        LegalBasisDossier dossier = dossier("NOTARIAL");
        dossier.markProvided();

        when(dossiers.findByVerificationCaseIdForUpdate(CASE_DB_ID))
                .thenReturn(Optional.of(dossier));
        when(versions.findMaxVersionNo(DOSSIER_DB_ID))
                .thenReturn(1);

        service.intake(
                CASE_ID,
                staff,
                metadata("NOTARIAL_PARTITION"),
                pdf()
        );

        ArgumentCaptor<LegalBasisDossierVersion> saved =
                ArgumentCaptor.forClass(LegalBasisDossierVersion.class);

        verify(versions).saveAndFlush(saved.capture());

        assertThat(saved.getValue().getVersionNo()).isEqualTo(2);
        assertThat(dossier.getStatus()).isEqualTo("LEGAL_BASIS_PROVIDED");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<com.legacyvault.verification.entity.LegalBasisVersionAllocation>>
                lines = ArgumentCaptor.forClass(List.class);

        verify(allocationRepository).saveAll(lines.capture());

        assertThat(lines.getValue()).hasSize(1);
        assertThat(lines.getValue().get(0).getAssetId()).isEqualTo(31L);
        assertThat(lines.getValue().get(0).getBeneficiaryId()).isEqualTo(41L);
        assertThat(lines.getValue().get(0).getAllocationDescription())
                .isEqualTo("toàn bộ");

        // Chỉ tạo phiên bản mới, không sửa các phiên bản cũ.
        verify(versions).findMaxVersionNo(DOSSIER_DB_ID);
        org.mockito.Mockito.verifyNoMoreInteractions(versions);
    }

    @Test
    void scope_mustBePresent_unique_andInsideTheCasesVault() {
        happyPath("NOTARIAL");

        assertThatThrownBy(() -> service.intake(
                CASE_ID,
                staff,
                metadataWith(null),
                pdf()
        )).satisfies(exception ->
                assertThat(codeOf(exception))
                        .isEqualTo(ErrorCode.VALIDATION_FAILED));

        assertThatThrownBy(() -> service.intake(
                CASE_ID,
                staff,
                metadataWith(List.of()),
                pdf()
        )).satisfies(exception ->
                assertThat(codeOf(exception))
                        .isEqualTo(ErrorCode.VALIDATION_FAILED));

        AllocationInput line = new AllocationInput(
                ASSET_ID,
                BENEFICIARY_ID,
                null
        );

        assertThatThrownBy(() -> service.intake(
                CASE_ID,
                staff,
                metadataWith(List.of(line, line)),
                pdf()
        )).satisfies(exception ->
                assertThat(codeOf(exception))
                        .isEqualTo(ErrorCode.VALIDATION_FAILED));

        when(assets.findByPublicIdAndVaultIdAndAssetTypeNot(
                ASSET_ID,
                VAULT_ID,
                AssetType.DOCUMENT
        )).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.intake(
                CASE_ID,
                staff,
                metadataWith(List.of(line)),
                pdf()
        )).satisfies(exception ->
                assertThat(codeOf(exception))
                        .isEqualTo(ErrorCode.VALIDATION_FAILED));

        happyPath("NOTARIAL");

        when(beneficiaries.findByPublicIdAndVault_VaultId(
                BENEFICIARY_ID,
                VAULT_ID
        )).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.intake(
                CASE_ID,
                staff,
                metadataWith(List.of(line)),
                pdf()
        )).satisfies(exception ->
                assertThat(codeOf(exception))
                        .isEqualTo(ErrorCode.VALIDATION_FAILED));

        verify(versions, never()).saveAndFlush(any());
        verify(allocationRepository, never()).saveAll(any());
        verifyNoInteractions(auditService);
    }
}