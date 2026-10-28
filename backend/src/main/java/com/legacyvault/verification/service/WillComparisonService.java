package com.legacyvault.verification.service;

import com.legacyvault.asset.entity.Asset;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.RecordWillComparisonRequest;
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
import com.legacyvault.will.repository.AssetVersionRepository;
import com.legacyvault.will.repository.WillAssetRepository;
import com.legacyvault.will.repository.WillVersionRef;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * PS-40 (ST-15, LV-WILL-001): Legal đối chiếu bản di chúc giấy gốc với một phiên bản bản scan đã lưu và ghi kết quả
 * cùng phiên bản/hash đã so. Hash chỉ xác định đúng phiên bản bản scan; nó không chứng minh giá trị pháp lý.
 *
 * <p>Chỉ ghi nhận kết quả, không xác nhận di chúc hợp lệ hay mở khóa. Riêng MATCH đầu tiên chuyển Vault sang
 * WILL_VERIFICATION đúng ST-15 (Main Flow v4.2); các kết quả khác không đổi trạng thái. Cổng chặn luồng duyệt
 * thông thường là {@link #isApprovalBlocked(Long)}: chỉ qua khi kết quả đối chiếu mới nhất của ca là MATCH.
 *
 * <p>Thứ tự khóa dòng: Vault -> ca xác minh (như Cancel Alert và quyết định chứng tử) để không deadlock.
 *
 */
@Service
public class WillComparisonService {

    static final String ENTITY_TYPE = "WILL_COMPARISON";
    static final String STEP_ID = "ST-15";
    static final String RULE_ID = "LV-WILL-001";
    static final int MAX_WILLS = 100;

    private final LegalCaseLookupRepository caseLookup;
    private final VerificationCaseRepository caseRepository;
    private final VaultRepository vaultRepository;
    private final OriginalWillIntakeRepository intakeRepository;
    private final WillAssetRepository willAssetRepository;
    private final AssetVersionRepository assetVersionRepository;
    private final WillComparisonRepository comparisonRepository;
    private final AuditService auditService;

    private com.legacyvault.verification.repository.LegalBasisDossierRepository basisDossiers;
    @org.springframework.beans.factory.annotation.Autowired
    public void setBasisDossiers(com.legacyvault.verification.repository.LegalBasisDossierRepository value) { basisDossiers = value; }

    public WillComparisonService(
            LegalCaseLookupRepository caseLookup,
            VerificationCaseRepository caseRepository,
            VaultRepository vaultRepository,
            OriginalWillIntakeRepository intakeRepository,
            WillAssetRepository willAssetRepository,
            AssetVersionRepository assetVersionRepository,
            WillComparisonRepository comparisonRepository,
            AuditService auditService
    ) {
        this.caseLookup = caseLookup;
        this.caseRepository = caseRepository;
        this.vaultRepository = vaultRepository;
        this.intakeRepository = intakeRepository;
        this.willAssetRepository = willAssetRepository;
        this.assetVersionRepository = assetVersionRepository;
        this.comparisonRepository = comparisonRepository;
        this.auditService = auditService;
    }

    @Transactional
    public WillComparisonResponse record(
            UUID caseId,
            CustomUserPrincipal principal,
            RecordWillComparisonRequest request
    ) {
        Long legalUserId = CustomUserPrincipal.requireUserId(principal);
        validate(request);

        // Đọc không khóa để biết Vault cần khóa; sau đó khóa theo thứ tự Vault -> ca.
        VerificationCase initialCase = caseLookup.findByPublicId(caseId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        Vault vault = vaultRepository.findByIdForUpdate(initialCase.getVaultId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        VerificationCase verificationCase = caseRepository
                .findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        if (!Objects.equals(verificationCase.getVaultId(), vault.getVaultId())) {
            throw new BusinessException(ErrorCode.LEGAL_VERIFICATION_INVALID_STATE);
        }
        // ST-15 đi sau ST-12: ca còn mở và giấy tờ khai tử đã được Legal chấp thuận. Sau MATCH đầu tiên Vault đã ở
        // WILL_VERIFICATION; vẫn cho đối chiếu lại ở trạng thái này.
        boolean statusAllowsComparison = Vault.STATUS_DOCUMENT_VERIFICATION.equals(vault.getStatus())
                || Vault.STATUS_WILL_VERIFICATION.equals(vault.getStatus());
        if (!verificationCase.isOpen() || !statusAllowsComparison) {
            throw new BusinessException(ErrorCode.LEGAL_VERIFICATION_INVALID_STATE);
        }

        OriginalWillIntake intake = intakeRepository
                .findByPublicIdAndVerificationCaseId(request.originalWillIntakeId(),
                        verificationCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        Asset will = willAssetRepository.findWill(request.willId(), vault.getVaultId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        WillVersionRef version = assetVersionRepository.findRef(will.getAssetId(), request.version())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        String result = request.result().name();
        String vaultStatusBefore = vault.getStatus();
        if (request.result() == RecordWillComparisonRequest.Result.MATCH
                && Vault.STATUS_DOCUMENT_VERIFICATION.equals(vaultStatusBefore)) {
            vault.markWillVerification();
        }
        WillComparison saved = comparisonRepository.saveAndFlush(new WillComparison(
                verificationCase.getVerificationCaseId(),
                intake.getOriginalWillIntakeId(),
                version.assetVersionId(),
                version.sha256Hash(),
                result,
                legalUserId,
                normalize(request.reason())
        ));

        if (request.result() == RecordWillComparisonRequest.Result.MATCH && basisDossiers != null) {
            basisDossiers.findByVerificationCaseIdForUpdate(verificationCase.getVerificationCaseId()).ifPresent(dossier -> {
                if (dossier.acceptsIntake() && com.legacyvault.verification.entity.LegalBasisDossier.STATUS_FORWARDED.equals(dossier.getStatus())) {
                    vault.markLegalBasisRouted(false);
                    vault.markLegalBasisVerification();
                }
            });
        }
        // Audit không ghi lý do; hash là metadata toàn vẹn nên được phép ghi.
        auditService.record(new AuditEvent(
                AuditAction.WILL_COMPARISON_RECORDED,
                AuditActorType.USER,
                legalUserId,
                vault.getVaultId(),
                ENTITY_TYPE,
                saved.getWillComparisonId(),
                null,
                null,
                null,
                Map.of(
                        "result", result,
                        "verificationCaseId", verificationCase.getPublicId().toString(),
                        "originalWillIntakeId", intake.getPublicId().toString(),
                        "willId", will.getPublicId().toString(),
                        "version", version.versionNo(),
                        "sha256", version.sha256Hash(),
                        "vaultStatusBefore", vaultStatusBefore,
                        "vaultStatusAfter", vault.getStatus()
                ),
                STEP_ID,
                RULE_ID
        ));

        return new WillComparisonResponse(
                saved.getPublicId(),
                verificationCase.getPublicId(),
                intake.getPublicId(),
                will.getPublicId(),
                version.versionNo(),
                version.sha256Hash(),
                result,
                principal.publicId(),
                saved.getReason(),
                saved.getComparedAt().toInstant(ZoneOffset.UTC)
        );
    }

    @Transactional(readOnly = true)
    public WillComparisonOverviewResponse overview(UUID caseId) {
        VerificationCase verificationCase = caseLookup.findByPublicId(caseId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        Vault vault = vaultRepository.findById(verificationCase.getVaultId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        Long caseDbId = verificationCase.getVerificationCaseId();

        List<WillComparisonOverviewResponse.OriginalIntake> intakes = intakeRepository
                .findByVerificationCaseIdOrderByReceivedAtDescOriginalWillIntakeIdDesc(caseDbId).stream()
                .map(intake -> new WillComparisonOverviewResponse.OriginalIntake(
                        intake.getPublicId(),
                        intake.getReceivedAt().toInstant(ZoneOffset.UTC),
                        intake.getEvidenceReference()))
                .toList();

        List<WillComparisonOverviewResponse.Will> wills = willAssetRepository
                .findWills(vault.getVaultId(), PageRequest.of(0, MAX_WILLS, Sort.by(Sort.Direction.DESC, "createdAt")))
                .getContent().stream()
                .map(will -> new WillComparisonOverviewResponse.Will(
                        will.getPublicId(),
                        assetVersionRepository.findVersions(will.getAssetId()).stream()
                                .map(v -> new WillComparisonOverviewResponse.Version(
                                        v.versionNo(),
                                        v.contentType(),
                                        v.fileSizeBytes(),
                                        v.sha256Hash(),
                                        v.uploadedAt().toInstant(ZoneOffset.UTC)))
                                .toList()))
                .toList();

        List<WillComparisonResponse> comparisons = comparisonRepository.findRowsByCase(caseDbId).stream()
                .map(row -> WillComparisonResponse.from(row, verificationCase.getPublicId()))
                .toList();

        String latest = comparisons.isEmpty() ? null : comparisons.get(0).result();
        return new WillComparisonOverviewResponse(
                verificationCase.getPublicId(),
                vault.getStatus(),
                !WillComparison.RESULT_MATCH.equals(latest),
                latest,
                intakes,
                wills,
                comparisons
        );
    }

    /**
     * Cổng chặn luồng duyệt thông thường (LV-WILL-001): chỉ được qua khi kết quả đối chiếu <b>mới nhất</b> của ca là
     * MATCH. Chưa đối chiếu, MISMATCH hoặc INCONCLUSIVE đều chặn. Dành cho bước duyệt ST-21 về sau.
     */
    @Transactional(readOnly = true)
    public boolean isApprovalBlocked(Long verificationCaseId) {
        return comparisonRepository
                .findFirstByVerificationCaseIdOrderByComparedAtDescWillComparisonIdDesc(verificationCaseId)
                .map(c -> !WillComparison.RESULT_MATCH.equals(c.getComparisonResult()))
                .orElse(true);
    }

    private static void validate(RecordWillComparisonRequest request) {
        if (request == null || request.originalWillIntakeId() == null || request.willId() == null
                || request.version() == null || request.version() < 1 || request.result() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        String reason = normalize(request.reason());
        if (reason != null && reason.length() > 1000) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
        // MISMATCH và INCONCLUSIVE phải có lý do để người sau hiểu vì sao luồng bị chặn.
        if (request.result() != RecordWillComparisonRequest.Result.MATCH && reason == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
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
