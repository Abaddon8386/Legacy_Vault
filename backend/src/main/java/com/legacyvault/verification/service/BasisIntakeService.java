package com.legacyvault.verification.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.asset.entity.AssetType;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.crypto.EncryptionService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.beneficiary.BeneficiaryRepository;
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
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * PS-41 (ST-18, LV-BASIS-001): Staff tiếp nhận văn bản căn cứ đã số hóa vào hồ sơ do Legal tạo ở ST-16. Staff chỉ bổ sung
 * phiên bản, không chọn nhánh. Server tính SHA-256 trên nội dung gốc, mã hóa file (AAD = UUID phiên bản) và sinh
 * {@code file_reference}. Mỗi lần tiếp nhận tạo một phiên bản MỚI (số tăng dần); phiên bản cũ không bị ghi đè. Mỗi phiên bản kèm
 * phạm vi phân bổ (tài sản cho người nhận, cùng Vault). Tiếp nhận không đồng nghĩa đã duyệt: chưa đổi trạng thái Vault.
 *
 * <p>Điều kiện: Staff đã nhận ca, ca còn mở, Vault AWAITING_LEGAL_BASIS, hồ sơ có nhánh NOTARIAL/COURT (ON_HOLD thì chưa nhận
 * văn bản). Loại văn bản phải đúng nhánh (NOTARIAL_PARTITION cho NOTARIAL; COURT_JUDGMENT/COURT_DECISION cho COURT).
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
    private final EncryptionService encryption;
    private final ObjectMapper objectMapper;
    private final BasisDossierViewService views;
    private final AuditService auditService;
    private final long maxFileBytes;

    public BasisIntakeService(StaffCaseLockRepository staffCases, VaultRepository vaultRepository,
            LegalBasisDossierRepository dossiers, LegalBasisDossierVersionRepository versions,
            LegalBasisVersionAllocationRepository allocations, AssetRepository assets, BeneficiaryRepository beneficiaries,
            EncryptionService encryption, ObjectMapper objectMapper, BasisDossierViewService views,
            AuditService auditService, @Value("${legacyvault.will.max-file-bytes:10485760}") long maxFileBytes) {
        this.staffCases = staffCases;
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
        this.maxFileBytes = maxFileBytes;
    }

    @Transactional
    public BasisDossierResponse intake(UUID caseId, CustomUserPrincipal principal, BasisIntakeMetadata metadata,
            MultipartFile file) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);
        if (metadata == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        VerificationCase verificationCase = staffCases.findOwnedByStaffForUpdate(caseId, staffUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        Vault vault = vaultRepository.findById(verificationCase.getVaultId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (!verificationCase.isOpen() || !Vault.STATUS_AWAITING_LEGAL_BASIS.equals(vault.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }
        LegalBasisDossier dossier = dossiers.findByVerificationCaseIdForUpdate(verificationCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (!dossier.acceptsIntake()) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        requireTypeMatchesRoute(metadata, dossier);
        List<long[]> scope = resolveScope(metadata, vault.getVaultId());
        WillFile scan = WillFile.inspect(file, maxFileBytes);

        // Hồ sơ đã bị khóa nên số phiên bản tăng dần không trùng; phiên bản cũ giữ nguyên.
        int versionNo = versions.findMaxVersionNo(dossier.getLegalBasisDossierId()) + 1;
        LegalBasisDossierVersion version = new LegalBasisDossierVersion(dossier.getLegalBasisDossierId(), versionNo,
                metadata.legalBasisType(), metadata.issuingAuthority().trim(), metadata.documentNumber().trim(),
                metadata.issueDate(), normalize(metadata.notaryAuthority()), normalize(metadata.notarialDocumentNumber()),
                metadata.notarizedAt(), evidenceJson(metadata.evidenceReference()), normalize(metadata.notes()),
                scan.fileName(), scan.contentType(), scan.size(), scan.sha256(), staffUserId);
        version.setEncryptedContent(encryption.encrypt(scan.content(), associatedData(version.getPublicId())));
        LegalBasisDossierVersion saved = versions.saveAndFlush(version);
        List<LegalBasisVersionAllocation> lines = new ArrayList<>();
        for (int i = 0; i < scope.size(); i++) {
            AllocationInput input = metadata.allocations().get(i);
            lines.add(new LegalBasisVersionAllocation(saved.getDossierVersionId(), scope.get(i)[0], scope.get(i)[1],
                    normalize(input.description())));
        }
        allocations.saveAll(lines);
        dossier.markProvided();

        // Audit không ghi số văn bản, cơ quan, ghi chú hay tên file: chỉ loại, hash và ID công khai.
        auditService.record(new AuditEvent(
                AuditAction.LEGAL_BASIS_RECEIVED,
                AuditActorType.USER,
                staffUserId,
                verificationCase.getVaultId(),
                ENTITY_TYPE,
                dossier.getLegalBasisDossierId(),
                null,
                null,
                null,
                Map.of(
                        "dossierId", dossier.getPublicId().toString(),
                        "verificationCaseId", verificationCase.getPublicId().toString(),
                        "version", version.getVersionNo(),
                        "legalBasisType", metadata.legalBasisType(),
                        "sha256", version.getSha256Hash(),
                        "sizeBytes", scan.size(),
                        "allocationCount", lines.size()
                ),
                STEP_ID,
                RULE_ID
        ));

        return views.view(verificationCase, false);
    }

    /** Gắn ciphertext với đúng phiên bản: chép sang bản ghi khác thì giải mã thất bại. */
    static byte[] associatedData(UUID versionPublicId) {
        return ("LEGAL_BASIS_VERSION:" + versionPublicId).getBytes(StandardCharsets.UTF_8);
    }

    /**
     * Kiểm tra phạm vi phân bổ: có ít nhất một dòng, tài sản (không phải di chúc) và người nhận đều thuộc Vault của ca, không
     * trùng cặp. Trả về từng cặp (assetId, beneficiaryId) nội bộ theo đúng thứ tự trong request.
     */
    private List<long[]> resolveScope(BasisIntakeMetadata metadata, Long vaultId) {
        List<AllocationInput> inputs = metadata.allocations();
        if (inputs == null || inputs.isEmpty()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        List<long[]> scope = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (AllocationInput input : inputs) {
            if (!seen.add(input.assetId() + "|" + input.beneficiaryId())) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED);
            }
            Long assetId = assets
                    .findByPublicIdAndVaultIdAndAssetTypeNot(input.assetId(), vaultId, AssetType.DOCUMENT)
                    .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED)).getAssetId();
            Long beneficiaryId = beneficiaries.findByPublicIdAndVault_VaultId(input.beneficiaryId(), vaultId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED)).getId();
            scope.add(new long[] { assetId, beneficiaryId });
        }
        return scope;
    }

    private static void requireTypeMatchesRoute(BasisIntakeMetadata metadata, LegalBasisDossier dossier) {
        boolean ok = LegalBasisDossier.ROUTE_NOTARIAL.equals(dossier.getRoute())
                ? "NOTARIAL_PARTITION".equals(metadata.legalBasisType())
                : "COURT_JUDGMENT".equals(metadata.legalBasisType()) || "COURT_DECISION".equals(metadata.legalBasisType());
        if (!ok) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        // LV-NOTARY-001: văn bản công chứng phải nêu tổ chức công chứng, số văn bản công chứng và ngày công chứng.
        if (LegalBasisDossier.ROUTE_NOTARIAL.equals(dossier.getRoute())
                && (normalize(metadata.notaryAuthority()) == null || normalize(metadata.notarialDocumentNumber()) == null
                        || metadata.notarizedAt() == null)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
    }

    private String evidenceJson(String evidenceReference) {
        String value = normalize(evidenceReference);
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(Map.of("evidenceReference", value));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Cannot serialize evidence metadata", ex);
        }
    }

    private static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
