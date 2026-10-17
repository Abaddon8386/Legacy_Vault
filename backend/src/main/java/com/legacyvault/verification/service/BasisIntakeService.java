package com.legacyvault.verification.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.asset.entity.AssetType;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.beneficiary.BeneficiaryRepository;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.AllocationInput;
import com.legacyvault.verification.dto.BasisDossierResponse;
import com.legacyvault.verification.dto.BasisIntakeMetadata;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.LegalBasisDossierVersion;
import com.legacyvault.verification.entity.LegalBasisVersionAllocation;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.LegalBasisVersionAllocationRepository;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.will.service.WillFile;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * PS-41 (ST-18, LV-BASIS-001): Staff tiếp nhận văn bản căn cứ đã số hóa
 * vào hồ sơ do Legal tạo ở ST-16. Staff chỉ bổ sung phiên bản, không chọn
 * nhánh. Server tính SHA-256 trên nội dung gốc, mã hóa file (AAD = UUID
 * phiên bản) và sinh file_reference. Mỗi lần tiếp nhận tạo một phiên bản
 * mới; phiên bản cũ không bị ghi đè. Mỗi phiên bản kèm phạm vi phân bổ
 * tài sản cho người nhận trong cùng Vault.
 *
 * PS-37: Sau khi tiếp nhận phiên bản mới, đánh giá lại snapshot để phát
 * hiện thay đổi và đánh dấu REVIEW_REQUIRED nếu cần.
 *
 * Package: com.legacyvault.verification.service
 * Tác dụng: Tiếp nhận phiên bản dossier và kiểm tra phạm vi phân bổ.
 */
@Service
public class BasisIntakeService {

    static final String ENTITY_TYPE = "LEGAL_BASIS_DOSSIER";
    static final String STEP_ID = "ST-18";
    static final String RULE_ID = "LV-BASIS-001";

    private final StaffCaseLockRepository staffCases;
    private final VerificationCaseRepository caseRepository;
    private final VaultRepository vaultRepository;
    private final LegalBasisDossierRepository dossiers;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalBasisVersionAllocationRepository allocations;
    private final AssetRepository assets;
    private final BeneficiaryRepository beneficiaries;
    private final EncryptionService encryption;
    private final ObjectMapper objectMapper;
    private final BasisDossierViewService views;
    private final AuditService auditService;
    private final LegalBasisReviewService reviewService;
    private final long maxFileBytes;

    public BasisIntakeService(
            StaffCaseLockRepository staffCases,
            VerificationCaseRepository caseRepository,
            VaultRepository vaultRepository,
            LegalBasisDossierRepository dossiers,
            LegalBasisDossierVersionRepository versions,
            LegalBasisVersionAllocationRepository allocations,
            AssetRepository assets,
            BeneficiaryRepository beneficiaries,
            EncryptionService encryption,
            ObjectMapper objectMapper,
            BasisDossierViewService views,
            AuditService auditService,
            LegalBasisReviewService reviewService,
            @Value("${legacyvault.will.max-file-bytes:10485760}")
            long maxFileBytes
    ) {
        this.staffCases = staffCases;
        this.caseRepository = caseRepository;
        this.vaultRepository = vaultRepository;
        this.dossiers = dossiers;
        this.versions = versions;
        this.allocations = allocations;
        this.assets = assets;
        this.beneficiaries = beneficiaries;
        this.encryption = encryption;
        this.objectMapper = objectMapper;
        this.views = views;
        this.auditService = auditService;
        this.reviewService = reviewService;
        this.maxFileBytes = maxFileBytes;
    }

    /**
     * Tiếp nhận phiên bản dossier mới.
     *
     * Thứ tự khóa bắt buộc: Vault -> VerificationCase -> Dossier.
     * Sau khi lưu phiên bản và audit, đánh giá lại snapshot PS-37.
     *
     * Package: com.legacyvault.verification.service
     * Class: BasisIntakeService
     * Vị trí: phương thức public chính của class.
     */
    @Transactional
    public BasisDossierResponse intake(
            UUID caseId,
            CustomUserPrincipal principal,
            BasisIntakeMetadata metadata,
            MultipartFile file
    ) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);

        if (caseId == null || metadata == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        /*
         * Bước 1: Đọc ca để xác định vaultId.
         * Chưa khóa ca hoặc dossier ở bước này.
         */
        VerificationCase initialCase = staffCases
                .findOwnedByStaff(caseId, staffUserId)
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        /*
         * Bước 2: Khóa Vault trước.
         */
        Vault vault = vaultRepository
                .findByIdForUpdate(initialCase.getVaultId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        /*
         * Bước 3: Khóa VerificationCase sau Vault.
         */
        VerificationCase verificationCase = caseRepository
                .findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        /*
         * Bước 4: Kiểm tra lại quyền sở hữu và quan hệ sau khi khóa.
         */
        if (!Objects.equals(
                verificationCase.getPublicId(), caseId)
                || !Objects.equals(
                verificationCase.getAssignedStaffUserId(), staffUserId)
                || !Objects.equals(
                verificationCase.getVaultId(), vault.getVaultId())) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }

        if (!verificationCase.isOpen()) {
            throw new BusinessException(ErrorCode.VERIFICATION_CASE_NOT_OPEN);
        }

        if (!Vault.STATUS_AWAITING_LEGAL_BASIS.equals(vault.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        /*
         * Bước 5: Chỉ khóa dossier sau Vault và VerificationCase.
         */
        LegalBasisDossier dossier = dossiers
                .findByVerificationCaseIdForUpdate(
                        verificationCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        if (!dossier.acceptsIntake()) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        /*
         * Bước 6: Kiểm tra loại văn bản, phạm vi phân bổ và file.
         */
        requireTypeMatchesRoute(metadata, dossier);

        List<long[]> scope = resolveScope(metadata, vault.getVaultId());

        WillFile scan = WillFile.inspect(file, maxFileBytes);

        /*
         * Bước 7: Tạo phiên bản mới.
         * Dossier đã được khóa nên số phiên bản được tăng tuần tự.
         * Phiên bản cũ không bị ghi đè.
         */
        int versionNo =
                versions.findMaxVersionNo(dossier.getLegalBasisDossierId()) + 1;

        LegalBasisDossierVersion version = new LegalBasisDossierVersion(
                dossier.getLegalBasisDossierId(),
                versionNo,
                metadata.legalBasisType(),
                metadata.issuingAuthority().trim(),
                metadata.documentNumber().trim(),
                metadata.issueDate(),
                normalize(metadata.notaryAuthority()),
                normalize(metadata.notarialDocumentNumber()),
                metadata.notarizedAt(),
                evidenceJson(metadata.evidenceReference()),
                normalize(metadata.notes()),
                scan.fileName(),
                scan.contentType(),
                scan.size(),
                scan.sha256(),
                staffUserId
        );

        version.setEncryptedContent(
                encryption.encrypt(
                        scan.content(),
                        associatedData(version.getPublicId())
                )
        );

        LegalBasisDossierVersion saved = versions.saveAndFlush(version);

        /*
         * Bước 8: Lưu allocation gắn với đúng phiên bản mới.
         */
        List<LegalBasisVersionAllocation> lines = new ArrayList<>();

        for (int i = 0; i < scope.size(); i++) {
            AllocationInput input = metadata.allocations().get(i);

            lines.add(new LegalBasisVersionAllocation(
                    saved.getDossierVersionId(),
                    scope.get(i)[0],
                    scope.get(i)[1],
                    normalize(input.description())
            ));
        }

        allocations.saveAll(lines);

        /*
         * Bước 9: Cập nhật dossier về trạng thái đã cung cấp.
         * Không tự chuyển Vault sang trạng thái xác minh pháp lý.
         */
        dossier.markProvided();
        dossiers.save(dossier);

        /*
         * Bước 10: Ghi audit tiếp nhận.
         * Không ghi số văn bản, cơ quan, ghi chú hoặc tên file.
         */
        auditService.record(new AuditEvent(
                AuditAction.LEGAL_BASIS_RECEIVED,
                AuditActorType.USER,
                staffUserId,
                vault.getVaultId(),
                ENTITY_TYPE,
                dossier.getLegalBasisDossierId(),
                null,
                null,
                null,
                Map.of(
                        "dossierId", dossier.getPublicId().toString(),
                        "verificationCaseId",
                        verificationCase.getPublicId().toString(),
                        "version", saved.getVersionNo(),
                        "legalBasisType", metadata.legalBasisType(),
                        "sha256", saved.getSha256Hash(),
                        "sizeBytes", scan.size(),
                        "allocationCount", lines.size()
                ),
                STEP_ID,
                RULE_ID
        ));

        /*
         * Bước 11: PS-37 — đánh giá snapshot sau khi có phiên bản mới.
         *
         * Nếu phát hiện version/hash/dispute/allocation thay đổi,
         * LegalBasisReviewService ghi REVIEW_REQUIRED, history và audit.
         * REVIEW_REQUIRED là kết quả nghiệp vụ, không phải lỗi tiếp nhận.
         *
         * Phương thức được gọi trong cùng transaction.
         */
        reviewService.evaluateAfterChange(verificationCase.getPublicId());

        return views.view(verificationCase, false);
    }

    /**
     * Gắn ciphertext với đúng phiên bản.
     * Sao chép ciphertext sang phiên bản khác sẽ khiến giải mã thất bại.
     *
     * Package: com.legacyvault.verification.service
     * Class: BasisIntakeService
     * Vị trí: ngay sau intake().
     */
    static byte[] associatedData(UUID versionPublicId) {
        return ("LEGAL_BASIS_VERSION:" + versionPublicId)
                .getBytes(StandardCharsets.UTF_8);
    }

    /**
     * Kiểm tra phạm vi phân bổ.
     *
     * Mỗi dòng phải tham chiếu tài sản và beneficiary thuộc cùng Vault;
     * không cho phép trùng cặp asset-beneficiary.
     *
     * Package: com.legacyvault.verification.service
     * Class: BasisIntakeService
     * Vị trí: sau associatedData().
     */
    private List<long[]> resolveScope(
            BasisIntakeMetadata metadata,
            Long vaultId
    ) {
        List<AllocationInput> inputs = metadata.allocations();

        if (inputs == null || inputs.isEmpty()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        List<long[]> scope = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        for (AllocationInput input : inputs) {
            if (input == null
                    || input.assetId() == null
                    || input.beneficiaryId() == null) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED);
            }

            if (!seen.add(input.assetId() + "|" + input.beneficiaryId())) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED);
            }

            Long assetId = assets
                    .findByPublicIdAndVaultIdAndAssetTypeNot(
                            input.assetId(),
                            vaultId,
                            AssetType.DOCUMENT
                    )
                    .orElseThrow(() ->
                            new BusinessException(ErrorCode.VALIDATION_FAILED))
                    .getAssetId();

            Long beneficiaryId = beneficiaries
                    .findByPublicIdAndVault_VaultId(
                            input.beneficiaryId(),
                            vaultId
                    )
                    .orElseThrow(() ->
                            new BusinessException(ErrorCode.VALIDATION_FAILED))
                    .getId();

            scope.add(new long[]{assetId, beneficiaryId});
        }

        return scope;
    }

    /**
     * Kiểm tra loại văn bản khớp với nhánh pháp lý của dossier.
     *
     * Package: com.legacyvault.verification.service
     * Class: BasisIntakeService
     * Vị trí: ngay sau resolveScope().
     */
    private static void requireTypeMatchesRoute(
            BasisIntakeMetadata metadata,
            LegalBasisDossier dossier
    ) {
        boolean ok = LegalBasisDossier.ROUTE_NOTARIAL.equals(dossier.getRoute())
                ? "NOTARIAL_PARTITION".equals(metadata.legalBasisType())
                : "COURT_JUDGMENT".equals(metadata.legalBasisType())
                || "COURT_DECISION".equals(metadata.legalBasisType());

        if (!ok) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        /*
         * LV-NOTARY-001: văn bản công chứng phải có tổ chức công chứng,
         * số văn bản công chứng và ngày công chứng.
         */
        if (LegalBasisDossier.ROUTE_NOTARIAL.equals(dossier.getRoute())
                && (normalize(metadata.notaryAuthority()) == null
                || normalize(metadata.notarialDocumentNumber()) == null
                || metadata.notarizedAt() == null)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
    }

    /**
     * Serialize metadata tham chiếu chứng cứ.
     *
     * Package: com.legacyvault.verification.service
     * Class: BasisIntakeService
     * Vị trí: sau requireTypeMatchesRoute().
     */
    private String evidenceJson(String evidenceReference) {
        String value = normalize(evidenceReference);

        if (value == null) {
            return null;
        }

        try {
            return objectMapper.writeValueAsString(
                    Map.of("evidenceReference", value)
            );
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(
                    "Cannot serialize evidence metadata", ex);
        }
    }

    /**
     * Chuẩn hóa chuỗi rỗng thành null.
     *
     * Package: com.legacyvault.verification.service
     * Class: BasisIntakeService
     * Vị trí: phương thức cuối class.
     */
    private static String normalize(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}