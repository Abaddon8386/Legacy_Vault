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
 * vào hồ sơ căn cứ của ca (do Legal phân loại ở ST-16; nếu chưa có thì mở hồ sơ theo loại văn bản nộp). Staff chỉ bổ sung phiên bản,
 * không tự chọn nhánh. Server tính SHA-256 trên nội dung gốc, mã hóa file (AAD = UUID
 * phiên bản) và sinh file_reference. Mỗi lần tiếp nhận tạo một phiên bản
 * mới; phiên bản cũ không bị ghi đè. Mỗi phiên bản kèm phạm vi phân bổ
 * tài sản cho người nhận trong cùng Vault.
 *
 * PS-37: Sau khi tiếp nhận phiên bản mới, đánh giá lại snapshot để phát
 * hiện thay đổi và đánh dấu REVIEW_REQUIRED nếu cần.
 *
 * <p>Bổ sung: được gọi qua {@link DistributionWorkflowService#receive} bởi {@code StaffBasisIntakeController} tại
 * {@code POST /api/v1/staff/verification-cases/{caseId}/basis-dossier/versions} (multipart, vai trò {@code STAFF_EXECUTOR}).
 * Ghi các bảng {@code legal_basis_dossiers}, {@code legal_basis_dossier_versions}, {@code legal_basis_version_allocations}
 * và có thể tạo mới {@code beneficiaries} (người nhận chỉ có tên trong văn bản Tòa án). Audit {@code LEGAL_BASIS_RECEIVED}.
 */
@Service
public class BasisIntakeService {
    /**
     * Dịch vụ ghi thông báo workflow gửi sang Legal.
     */
    private final com.legacyvault.notification.WorkflowNotificationService notifications;

    /**
     * Loại thực thể ghi vào audit log.
     */
    static final String ENTITY_TYPE = "LEGAL_BASIS_DOSSIER";
    /**
     * Mã bước quy trình ghi vào audit (ST-18: tiếp nhận văn bản căn cứ).
     */
    static final String STEP_ID = "ST-18";
    /**
     * Mã quy tắc nghiệp vụ ghi vào audit.
     */
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
    /**
     * Dung lượng tối đa của file tải lên (byte), cấu hình {@code legacyvault.will.max-file-bytes}, mặc định 10 MiB.
     */
    private final long maxFileBytes;

    /**
     * Khởi tạo service với các repository (ca, Vault, hồ sơ, phiên bản, phân bổ, tài sản, người nhận), mã hóa
     * (AES cho file, mã hóa số giấy tờ người nhận), audit, rà soát PS-37, thông báo và giới hạn dung lượng file.
     */
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
            long maxFileBytes, com.legacyvault.notification.WorkflowNotificationService notifications
    ) {
        this.notifications = notifications;
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
     * Tiếp nhận phiên bản dossier mới. Thứ tự khóa bắt buộc: Vault -> VerificationCase -> Dossier.
     *
     * Các bước: kiểm tra tham số; tìm ca của Staff; khóa Vault → VerificationCase → Dossier (nếu chưa có dossier thì mở dossier
     * theo loại giấy tờ nộp); kiểm tra ca mở, Vault ở trạng thái tiếp nhận căn cứ, dossier nhận được phiên bản mới, không ON_HOLD;
     * kiểm tra loại văn bản khớp nhánh ({@link #requireTypeMatchesRoute}) và phạm vi phân bổ nếu có ({@link #resolveScope});
     * đọc file ({@code WillFile.inspect}: giới hạn dung lượng, tính SHA-256); tạo phiên bản số kế tiếp, mã hóa nội dung bằng
     * AES với AAD là UUID phiên bản; lưu phân bổ; đánh dấu dossier PROVIDED; ghi audit {@code LEGAL_BASIS_RECEIVED} (không ghi số
     * văn bản, ghi chú hay tên file); đánh giá lại snapshot PS-37; gửi thông báo cho Legal.
     *
     * @param caseId UUID công khai của ca xác minh
     * @param principal Staff đang đăng nhập (phải là người nhận ca)
     * @param metadata metadata văn bản căn cứ (loại, cơ quan cấp, số, ngày, công chứng, phân bổ tùy chọn)
     * @param file file scan văn bản
     * @return hồ sơ căn cứ sau khi thêm phiên bản (kèm thông báo)
     * @throws com.legacyvault.common.error.BusinessException VALIDATION_FAILED, RESOURCE_NOT_FOUND, VERIFICATION_CASE_NOT_OPEN,
     *         BASIS_DOSSIER_INVALID_STATE và LEGAL_WORKFLOW_ON_HOLD khi Vault/dossier đang ON_HOLD
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

        var notification = notifications.record(verificationCase, com.legacyvault.notification.WorkflowNotificationService.Workspace.LEGAL, "LEGAL_BASIS_RECEIVED", "basis:" + saved.getPublicId(), null);
        return views.view(verificationCase, false).withNotification(notification);
    }

    /**
     * Route follows the submitted document type; an unknown type is a validation error.
     *
     * <p>Mở dossier mới theo loại văn bản nộp: {@code NOTARIAL_PARTITION} → nhánh công chứng (không tranh chấp);
     * {@code COURT_JUDGMENT}/{@code COURT_DECISION} → nhánh Tòa án (có tranh chấp).
     *
     * @throws com.legacyvault.common.error.BusinessException VALIDATION_FAILED nếu loại văn bản không nhận diện được
     */
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
     *
     * <p>Dữ liệu liên kết (AAD) cho mã hóa AES-GCM, dạng {@code LEGAL_BASIS_VERSION:<UUID phiên bản>}.
     * Cũng được {@code IntakeAttachmentService} dùng khi giải mã nội dung phiên bản.
     *
     * @param versionPublicId UUID công khai của phiên bản
     * @return AAD dạng byte UTF-8
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
     * <p>Kiểm tra và quy đổi các dòng phân bổ từ client thành {@link ScopeLine}: mỗi dòng phải chọn đúng một trong hai
     * (người nhận có sẵn trong kho hoặc người mới từ văn bản Tòa án, chỉ hợp lệ ở nhánh COURT), không trùng cặp
     * tài sản-người nhận, tài sản không phải loại DOCUMENT và thuộc cùng Vault, người nhận có sẵn thuộc cùng Vault.
     *
     * @param inputs danh sách phân bổ từ client
     * @param vaultId ID Vault đang xử lý
     * @param route nhánh của dossier
     * @return danh sách dòng đã kiểm tra
     * @throws com.legacyvault.common.error.BusinessException VALIDATION_FAILED khi dữ liệu sai
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

    /**
     * Kết quả lưu phân bổ: các dòng đã lưu và bản đồ người nhận mới tạo từ văn bản Tòa án (khóa theo {@code courtKey}).
     *
     * @param lines các dòng phân bổ đã lưu
     * @param courtRecipients người nhận mới tạo trong giao dịch này
     */
    private record Persisted(List<LegalBasisVersionAllocation> lines, Map<String, Beneficiary> courtRecipients) {
    }

    /**
     * BE-02: lưu các dòng phân bổ gắn với đúng phiên bản vừa tạo; người nhận chỉ có tên trong văn bản Tòa án được tạo ngay trong giao dịch
     * này ({@link #createCourtRecipient}), cùng một người ở nhiều dòng chỉ tạo một lần.
     *
     * @return các dòng đã lưu và người nhận mới tạo
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
     * Chỉ lưu phân bổ, không duyệt gì ở đây; người gọi quyết định phase có cho phép hay không.
     *
     * <p>Dùng cho distribution workflow khi Staff nộp phân bổ ({@code submitAllocations}): kiểm tra mọi tài sản/người nhận của Vault,
     * thay thế (supersede) phân bổ cũ của cùng phiên bản tài liệu rồi lưu phân bổ mới. Người gọi phải đang giữ khóa Vault → ca → dossier.
     *
     * @param vault Vault đã khóa
     * @param dossier hồ sơ căn cứ đã khóa
     * @param dossierVersionId ID phiên bản tài liệu
     * @param inputs các dòng phân bổ mới
     * @return số dòng đã lưu
     */
    public int replaceAllocations(Vault vault, LegalBasisDossier dossier, Long dossierVersionId,
            List<AllocationInput> inputs) {
        List<ScopeLine> scope = resolveScope(inputs, vault.getVaultId(), dossier.getRoute());
        allocations.supersedeForVersion(dossierVersionId);
        return persistAllocations(vault, dossierVersionId, scope, inputs).lines().size();
    }

    /**
     * Một dòng phạm vi đã kiểm tra: người nhận có sẵn ({@code beneficiaryId}) hoặc người sẽ tạo từ văn bản.
     *
     * @param assetId ID nội bộ của tài sản
     * @param beneficiaryId ID nội bộ người nhận có sẵn, hoặc null nếu là người mới từ văn bản
     * @param courtKey khóa nhận diện người nhận mới (họ tên + số giấy tờ + ngày sinh), null nếu là người có sẵn
     * @param court dữ liệu người nhận mới từ văn bản Tòa án, null nếu là người có sẵn
     */
    private record ScopeLine(
            Long assetId,
            Long beneficiaryId,
            String courtKey,
            BeneficiaryDtos.UpsertRequest court
    ) {
    }

    /**
     * Cùng họ tên + số giấy tờ + ngày sinh trong một phiên bản được coi là cùng một người nhận.
     *
     * @param court dữ liệu người nhận từ văn bản Tòa án
     * @return khóa chuẩn hóa dạng {@code court:<họ tên thường>|<số giấy tờ>|<ngày sinh>}
     * @throws com.legacyvault.common.error.BusinessException VALIDATION_FAILED nếu thiếu họ tên
     */
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

    /**
     * Tạo người nhận từ văn bản Tòa án ({@code Beneficiary.fromCourtDocument}) gắn với phiên bản; số giấy tờ được mã hóa bằng
     * {@link IdentityNumberCipher}, email được chuẩn hóa chữ thường. Lưu vào bảng {@code beneficiaries}.
     *
     * @return người nhận đã lưu
     */
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
     *
     * @throws com.legacyvault.common.error.BusinessException VALIDATION_FAILED nếu loại văn bản không khớp nhánh hoặc
     *         văn bản công chứng thiếu tổ chức, số hay ngày công chứng
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
     * @return JSON {@code {"evidenceReference": ...}} hoặc null nếu không có tham chiếu
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
     * @param value chuỗi đầu vào (có thể null)
     * @return chuỗi đã trim hoặc null nếu rỗng
     */
    private static String normalize(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}