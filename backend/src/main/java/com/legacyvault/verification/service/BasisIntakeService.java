package com.legacyvault.verification.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.asset.entity.AssetType;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.beneficiary.Beneficiary;
import com.legacyvault.beneficiary.BeneficiaryDtos;
import com.legacyvault.beneficiary.BeneficiaryRepository;
import com.legacyvault.beneficiary.IdentityNumberCipher;
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
import com.legacyvault.will.service.WillFile;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
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
 */
@Service
public class BasisIntakeService {

    static final String ENTITY_TYPE = "LEGAL_BASIS_DOSSIER";
    static final String STEP_ID = "ST-18";
    static final String RULE_ID = "LV-BASIS-001";

    private final StaffCaseLockRepository staffCases;
    private final VaultRepository vaultRepository;
    private final LegalBasisDossierRepository dossiers;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalBasisVersionAllocationRepository allocations;
    private final AssetRepository assets;
    private final BeneficiaryRepository beneficiaries;
    private final IdentityNumberCipher identityCipher;
    private final EncryptionService encryption;
    private final ObjectMapper objectMapper;
    private final BasisDossierViewService views;
    private final AuditService auditService;
    private final LegalBasisLockedState lockedState;
    private final LegalBasisReviewService reviewService;
    private final long maxFileBytes;

    public BasisIntakeService(
            StaffCaseLockRepository staffCases,
            VaultRepository vaultRepository,
            LegalBasisDossierRepository dossiers,
            LegalBasisDossierVersionRepository versions,
            LegalBasisVersionAllocationRepository allocations,
            AssetRepository assets,
            BeneficiaryRepository beneficiaries,
            IdentityNumberCipher identityCipher,
            EncryptionService encryption,
            ObjectMapper objectMapper,
            BasisDossierViewService views,
            AuditService auditService,
            LegalBasisLockedState lockedState,
            LegalBasisReviewService reviewService,
            @Value("${legacyvault.will.max-file-bytes:10485760}")
            long maxFileBytes
    ) {
        this.staffCases = staffCases;
        this.vaultRepository = vaultRepository;
        this.dossiers = dossiers;
        this.versions = versions;
        this.allocations = allocations;
        this.assets = assets;
        this.beneficiaries = beneficiaries;
        this.identityCipher = identityCipher;
        this.encryption = encryption;
        this.objectMapper = objectMapper;
        this.views = views;
        this.auditService = auditService;
        this.lockedState = lockedState;
        this.reviewService = reviewService;
        this.maxFileBytes = maxFileBytes;
    }

    /**
     * Tiếp nhận phiên bản dossier mới.
     *
     * Thứ tự khóa bắt buộc: Vault -> VerificationCase -> Dossier.
     * Sau khi lưu phiên bản và audit, đánh giá lại snapshot PS-37.
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
        VerificationCase initialCase = staffCases.findOwnedByStaff(caseId, staffUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        /*
         * Bước 2: Khóa Vault trước.
         */
        Vault vault = vaultRepository.findByIdForUpdate(initialCase.getVaultId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(vault);

        /*
         * Bước 3: Khóa VerificationCase sau Vault.
         */
        VerificationCase verificationCase = staffCases.findOwnedByStaffForUpdate(caseId, staffUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(verificationCase);

        /*
         * Bước 4: Kiểm tra lại quyền sở hữu và quan hệ sau khi khóa.
         */
        if (!Objects.equals(verificationCase.getAssignedStaffUserId(), staffUserId)
                || !Objects.equals(verificationCase.getVaultId(), vault.getVaultId())
                || !Objects.equals(verificationCase.getPublicId(), caseId)) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }

        if (!verificationCase.isOpen()) {
            throw new BusinessException(ErrorCode.VERIFICATION_CASE_NOT_OPEN);
        }

        if (!vault.isLegalBasisIntakeState()) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        /*
         * Bước 5: Chỉ khóa dossier sau Vault và VerificationCase.
         * Chưa có dossier (Legal chưa phân loại): mở dossier theo loại giấy tờ thực tế được nộp. Vault đang bị khóa
         * nên hai request không tạo được hai dossier.
         */
        LegalBasisDossier existing = dossiers
                .findByVerificationCaseIdForUpdate(verificationCase.getVerificationCaseId()).orElse(null);
        boolean openedByIntake = existing == null;
        LegalBasisDossier dossier = openedByIntake
                ? dossiers.saveAndFlush(openDossier(verificationCase.getVerificationCaseId(), metadata, staffUserId))
                : existing;
        lockedState.refresh(dossier);

        if (!dossier.acceptsIntake()) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }
        LegalWorkflowGuard.requireNotOnHold(vault, dossier);

        /*
         * Bước 6: Kiểm tra loại văn bản, phạm vi phân bổ và file.
         */
        requireTypeMatchesRoute(metadata, dossier);

        // Distribution workflow: the document upload carries no allocation; allocations are submitted in their own step.
        List<AllocationInput> inputs = metadata.allocations() == null ? List.of() : metadata.allocations();
        List<ScopeLine> scope = inputs.isEmpty() ? List.of() : resolveScope(inputs, vault.getVaultId(), dossier.getRoute());

        WillFile scan = WillFile.inspect(file, maxFileBytes);

        /*
         * Bước 7: Tạo phiên bản mới.
         * Dossier đã được khóa nên số phiên bản được tăng tuần tự.
         * Phiên bản cũ không bị ghi đè.
         */
        int versionNo = versions.findMaxVersionNo(dossier.getLegalBasisDossierId()) + 1;

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
         * Bước 8: Lưu allocation (nếu có) gắn với đúng phiên bản mới. Quy trình phân chia mới không gửi phân bổ ở bước này.
         */
        Persisted persisted = persistAllocations(vault, saved.getDossierVersionId(), scope, inputs);
        List<LegalBasisVersionAllocation> lines = persisted.lines();
        Map<String, Beneficiary> courtRecipients = persisted.courtRecipients();

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
                Map.ofEntries(
                        Map.entry("dossierId", dossier.getPublicId().toString()),
                        Map.entry("verificationCaseId", verificationCase.getPublicId().toString()),
                        Map.entry("version", saved.getVersionNo()),
                        Map.entry("legalBasisType", metadata.legalBasisType()),
                        Map.entry("route", dossier.getRoute()),
                        Map.entry("dossierOpenedByIntake", openedByIntake),
                        Map.entry("sha256", saved.getSha256Hash()),
                        Map.entry("sizeBytes", scan.size()),
                        Map.entry("allocationCount", lines.size()),
                        Map.entry("courtRecipientCount", courtRecipients.size()),
                        Map.entry("courtRecipientIds", courtRecipients.values().stream()
                                .map(recipient -> recipient.getPublicId().toString()).sorted().toList())
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

    /** Route follows the submitted document type; an unknown type is a validation error. */
    private static LegalBasisDossier openDossier(Long verificationCaseId, BasisIntakeMetadata metadata, Long staffUserId) {
        String type = metadata.legalBasisType();
        String route = "NOTARIAL_PARTITION".equals(type) ? LegalBasisDossier.ROUTE_NOTARIAL
                : ("COURT_JUDGMENT".equals(type) || "COURT_DECISION".equals(type)) ? LegalBasisDossier.ROUTE_COURT : null;
        if (route == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        String dispute = LegalBasisDossier.ROUTE_NOTARIAL.equals(route)
                ? LegalBasisDossier.DISPUTE_NONE : LegalBasisDossier.DISPUTE_DISPUTED;
        return LegalBasisDossier.openedByIntake(verificationCaseId, route, dispute, staffUserId);
    }

    /**
     * Gắn ciphertext với đúng phiên bản.
     * Sao chép ciphertext sang phiên bản khác sẽ khiến giải mã thất bại.
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
     */
    private List<ScopeLine> resolveScope(
            List<AllocationInput> inputs,
            Long vaultId,
            String route
    ) {
        if (inputs == null || inputs.isEmpty()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        List<ScopeLine> scope = new ArrayList<>();
        Set<String> seen = new HashSet<>();

        for (AllocationInput input : inputs) {
            if (input == null || input.assetId() == null) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED);
            }

            /*
             * BE-02: đúng một trong hai — người đã có trong kho hoặc người chỉ có tên trong văn bản Tòa án.
             * Người tạo từ văn bản chỉ hợp lệ ở nhánh COURT (D-LEGAL-002); nhánh công chứng không tự thêm người nhận.
             */
            boolean existing = input.beneficiaryId() != null;
            boolean fromCourt = input.courtRecipient() != null;

            if (existing == fromCourt
                    || (fromCourt && !LegalBasisDossier.ROUTE_COURT.equals(route))) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED);
            }

            String recipientKey = existing ? input.beneficiaryId().toString() : courtKey(input.courtRecipient());

            if (!seen.add(input.assetId() + "|" + recipientKey)) {
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

            if (existing) {
                Long beneficiaryId = beneficiaries
                        .findByPublicIdAndVault_VaultId(
                                input.beneficiaryId(),
                                vaultId
                        )
                        .orElseThrow(() ->
                                new BusinessException(ErrorCode.VALIDATION_FAILED))
                        .getId();

                scope.add(new ScopeLine(assetId, beneficiaryId, null, null));
            } else {
                scope.add(new ScopeLine(assetId, null, recipientKey, input.courtRecipient()));
            }
        }

        return scope;
    }

    private record Persisted(List<LegalBasisVersionAllocation> lines, Map<String, Beneficiary> courtRecipients) {
    }

    /**
     * BE-02: người chỉ có tên trong văn bản Tòa án được tạo ngay trong giao dịch này, gắn đúng phiên bản vừa lưu.
     * Cùng một người ở nhiều dòng chỉ tạo một lần.
     */
    private Persisted persistAllocations(Vault vault, Long dossierVersionId, List<ScopeLine> scope,
            List<AllocationInput> inputs) {
        List<LegalBasisVersionAllocation> lines = new ArrayList<>();
        Map<String, Beneficiary> courtRecipients = new HashMap<>();

        for (int i = 0; i < scope.size(); i++) {
            ScopeLine line = scope.get(i);
            AllocationInput input = inputs.get(i);

            Long beneficiaryId = line.beneficiaryId();
            if (beneficiaryId == null) {
                Beneficiary recipient = courtRecipients.get(line.courtKey());
                if (recipient == null) {
                    recipient = createCourtRecipient(vault, dossierVersionId, line.court());
                    courtRecipients.put(line.courtKey(), recipient);
                }
                beneficiaryId = recipient.getId();
            }

            lines.add(new LegalBasisVersionAllocation(
                    dossierVersionId,
                    line.assetId(),
                    beneficiaryId,
                    normalize(input.description())
            ));
        }

        allocations.saveAll(lines);
        return new Persisted(lines, courtRecipients);
    }

    /**
     * Distribution workflow (Staff submits allocations): validates every asset/recipient of the Vault, retires the
     * previous allocation of the same document version and stores the new one. The caller holds the
     * Vault -> case -> dossier locks and decides whether the phase allows it; nothing is approved here.
     */
    public int replaceAllocations(Vault vault, LegalBasisDossier dossier, Long dossierVersionId,
            List<AllocationInput> inputs) {
        List<ScopeLine> scope = resolveScope(inputs, vault.getVaultId(), dossier.getRoute());
        allocations.supersedeForVersion(dossierVersionId);
        return persistAllocations(vault, dossierVersionId, scope, inputs).lines().size();
    }

    /** Một dòng phạm vi đã kiểm tra: người nhận có sẵn ({@code beneficiaryId}) hoặc người sẽ tạo từ văn bản. */
    private record ScopeLine(
            Long assetId,
            Long beneficiaryId,
            String courtKey,
            BeneficiaryDtos.UpsertRequest court
    ) {
    }

    /** Cùng họ tên + số giấy tờ + ngày sinh trong một phiên bản được coi là cùng một người nhận. */
    private static String courtKey(BeneficiaryDtos.UpsertRequest court) {
        String name = normalize(court.fullName());
        if (name == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        String identity = normalize(court.identityNumber());
        return "court:" + name.toLowerCase(Locale.ROOT)
                + "|" + (identity == null ? "" : identity)
                + "|" + (court.dateOfBirth() == null ? "" : court.dateOfBirth());
    }

    private Beneficiary createCourtRecipient(
            Vault vault,
            Long dossierVersionId,
            BeneficiaryDtos.UpsertRequest court
    ) {
        UUID publicId = UUID.randomUUID();
        String identity = normalize(court.identityNumber());
        String email = normalize(court.email());

        return beneficiaries.saveAndFlush(Beneficiary.fromCourtDocument(
                publicId,
                vault,
                dossierVersionId,
                normalize(court.fullName()),
                normalize(court.relationship()),
                court.dateOfBirth(),
                normalize(court.phone()),
                email == null ? null : email.toLowerCase(Locale.ROOT),
                identity == null ? null : identityCipher.encrypt(identity, publicId)
        ));
    }

    /**
     * Kiểm tra loại văn bản khớp với nhánh pháp lý của dossier.
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
     */
    private static String normalize(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}