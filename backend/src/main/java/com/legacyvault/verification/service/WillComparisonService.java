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
 * <p>PS-139: mỗi bản giấy (originalWillIntakeId) chỉ có tối đa một kết luận; ghi lần hai bị từ chối
 * {@code WILL_COMPARISON_ALREADY_RECORDED} (409) và không sửa kết luận cũ. Quy tắc khi bản số đổi sau kết luận chưa được chốt.
 *
 * <p>Thứ tự khóa dòng: Vault -> ca xác minh (như Cancel Alert và quyết định chứng tử) để không deadlock.
 *
 * <p>Được {@code LegalWillComparisonController} gọi, base path
 * {@code /api/v1/legal-verifications/verification-cases/{caseId}/will-comparisons} (vai trò LEGAL_VERIFIER):
 * {@code POST} gọi {@link #record} (body {@link RecordWillComparisonRequest}, trả {@link WillComparisonResponse}) và
 * {@code GET} gọi {@link #overview} (trả {@link WillComparisonOverviewResponse}). {@link #isApprovalBlocked} được
 * {@code CourtRouteGuard} và {@code DistributionWorkflowService} dùng. Bảng: {@code will_comparisons},
 * {@code original_will_intakes}, {@code verification_cases}, {@code vaults}, tài sản di chúc và phiên bản. Ghi audit
 * {@code WILL_COMPARISON_RECORDED} và gửi thông báo cho Staff.
 */
@Service
public class WillComparisonService {
    private final com.legacyvault.notification.WorkflowNotificationService notifications;

    /**
     * Loại thực thể ghi trong audit.
     */
    static final String ENTITY_TYPE = "WILL_COMPARISON";
    /**
     * Mã bước quy trình ghi vào audit.
     */
    static final String STEP_ID = "ST-15";
    /**
     * Mã quy tắc nghiệp vụ ghi vào audit.
     */
    static final String RULE_ID = "LV-WILL-001";
    /**
     * Số di chúc tối đa trả về trong phần tổng quan đối chiếu.
     */
    static final int MAX_WILLS = 100;

    private final LegalCaseLookupRepository caseLookup;
    private final VerificationCaseRepository caseRepository;
    private final VaultRepository vaultRepository;
    private final OriginalWillIntakeRepository intakeRepository;
    private final WillAssetRepository willAssetRepository;
    private final AssetVersionRepository assetVersionRepository;
    private final WillComparisonRepository comparisonRepository;
    private final AuditService auditService;

    /**
     * @param caseLookup tra cứu case theo phạm vi Legal toàn cục
     * @param caseRepository repository hồ sơ xác minh (có khóa ghi)
     * @param vaultRepository repository Vault (có khóa ghi)
     * @param intakeRepository repository bản ghi nhận di chúc gốc
     * @param willAssetRepository repository tài sản loại di chúc
     * @param assetVersionRepository repository phiên bản tài sản (bản scan)
     * @param comparisonRepository repository kết quả đối chiếu
     * @param auditService dịch vụ ghi nhật ký kiểm toán
     * @param notifications dịch vụ thông báo workflow
     */
    public WillComparisonService(
            LegalCaseLookupRepository caseLookup,
            VerificationCaseRepository caseRepository,
            VaultRepository vaultRepository,
            OriginalWillIntakeRepository intakeRepository,
            WillAssetRepository willAssetRepository,
            AssetVersionRepository assetVersionRepository,
            WillComparisonRepository comparisonRepository,
            AuditService auditService
    , com.legacyvault.notification.WorkflowNotificationService notifications) {
        this.notifications = notifications;
        this.caseLookup = caseLookup;
        this.caseRepository = caseRepository;
        this.vaultRepository = vaultRepository;
        this.intakeRepository = intakeRepository;
        this.willAssetRepository = willAssetRepository;
        this.assetVersionRepository = assetVersionRepository;
        this.comparisonRepository = comparisonRepository;
        this.auditService = auditService;
    }

    /**
     * Ghi kết quả đối chiếu di chúc giấy với bản scan.
     * API: {@code POST /api/v1/legal-verifications/verification-cases/{caseId}/will-comparisons}.
     *
     * <p>Các bước: kiểm tra request; tra case không khóa rồi khóa Vault -> case; yêu cầu case mở và Vault ở
     * DOCUMENT_VERIFICATION hoặc WILL_VERIFICATION; tìm bản ghi nhận, di chúc và phiên bản scan; từ chối nếu bản giấy đã có
     * kết luận; từ chối nếu bản scan đã bị thay bằng phiên bản mới hơn; nếu kết quả là MATCH và Vault ở
     * DOCUMENT_VERIFICATION thì chuyển Vault sang WILL_VERIFICATION; lưu kết quả; ghi audit {@code WILL_COMPARISON_RECORDED}
     * (không ghi lý do, có ghi SHA-256); gửi thông báo cho Staff.
     *
     * @param caseId public id của hồ sơ xác minh
     * @param principal Legal Verifier đang đăng nhập
     * @param request bản giấy, di chúc, phiên bản, kết quả và lý do
     * @return kết quả đã lưu kèm thông báo
     * @throws BusinessException {@code VALIDATION_FAILED}, {@code RESOURCE_NOT_FOUND},
     *         {@code LEGAL_VERIFICATION_INVALID_STATE}, {@code WILL_COMPARISON_ALREADY_RECORDED}
     */
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
        // WILL_VERIFICATION; vẫn cho ghi kết luận cho một bản giấy khác ở trạng thái này.
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

        // PS-139: mỗi bản giấy chỉ có một kết luận bất biến. Mọi lần ghi đều giữ khóa Vault -> ca ở trên nên kiểm tra
        // này không thể chạy đua; kết luận lịch sử không bao giờ bị ghi đè hay xóa.
        if (comparisonRepository.existsByOriginalWillIntakeId(intake.getOriginalWillIntakeId())) {
            throw new BusinessException(ErrorCode.WILL_COMPARISON_ALREADY_RECORDED);
        }
        // Phiên bản bản scan đã bị thay bằng bản mới hơn thì không còn là bản đang đối chiếu.
        if (assetVersionRepository.findVersions(will.getAssetId()).stream()
                .anyMatch(v -> v.versionNo() > version.versionNo())) {
            throw new BusinessException(ErrorCode.LEGAL_VERIFICATION_INVALID_STATE);
        }

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

        var notification = notifications.record(verificationCase, com.legacyvault.notification.WorkflowNotificationService.Workspace.STAFF, "WILL_COMPARISON_RECORDED", "will:" + saved.getPublicId(), normalize(request.reason()));
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
        ).withNotification(notification);
    }

    /**
     * Tổng quan đối chiếu của ca: các lần nhận bản giấy, danh sách di chúc cùng phiên bản (tối đa 100), các kết luận đã ghi
     * (mới nhất trước), kết quả mới nhất và cờ chặn luồng duyệt.
     * API: {@code GET /api/v1/legal-verifications/verification-cases/{caseId}/will-comparisons}. Chỉ đọc; cũng được
     * {@code LegalReadService.context} dùng.
     *
     * @param caseId public id của hồ sơ xác minh
     * @return tổng quan đối chiếu
     * @throws BusinessException {@code RESOURCE_NOT_FOUND}
     */
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

        List<WillComparisonRow> comparisonRows = comparisonRepository.findRowsByCase(caseDbId);
        List<WillComparisonResponse> comparisons = comparisonRows.stream()
                .map(row -> WillComparisonResponse.from(row, verificationCase.getPublicId()))
                .toList();

        String latest = comparisons.isEmpty() ? null : comparisons.get(0).result();
        return new WillComparisonOverviewResponse(
                verificationCase.getPublicId(),
                vault.getStatus(),
                blockedByLatest(comparisonRows, vault.getVaultId()),
                latest,
                intakes,
                wills,
                comparisons
        );
    }

    /**
     * Cổng chặn luồng duyệt thông thường (LV-WILL-001): chỉ được qua khi kết quả đối chiếu <b>mới nhất</b> của ca là
     * MATCH <b>và</b> bản scan được đối chiếu vẫn là phiên bản mới nhất của di chúc đó (PS-139 AC4). Chưa đối chiếu,
     * MISMATCH, INCONCLUSIVE, hoặc MATCH của một bản số đã bị thay bằng bản mới hơn đều chặn: kết luận cũ chỉ là lịch sử
     * của bản số cũ. Dành cho bước duyệt ST-21 về sau.
     *
     * @param verificationCaseId id nội bộ của hồ sơ xác minh
     * @return {@code true} nếu bị chặn (kể cả khi không tìm thấy hồ sơ)
     */
    @Transactional(readOnly = true)
    public boolean isApprovalBlocked(Long verificationCaseId) {
        Long vaultId = caseRepository.findById(verificationCaseId)
                .map(VerificationCase::getVaultId)
                .orElse(null);
        if (vaultId == null) {
            return true;
        }
        return blockedByLatest(comparisonRepository.findRowsByCase(verificationCaseId), vaultId);
    }

    /**
     * Quyết định bị chặn hay không dựa trên kết quả mới nhất: bị chặn nếu chưa có kết quả, kết quả không phải MATCH hoặc
     * bản scan đã đối chiếu không còn hiện hành.
     *
     * @param rowsNewestFirst kết quả đối chiếu của ca, mới nhất trước (đúng thứ tự của {@code findRowsByCase})
     * @param vaultId id nội bộ của Vault
     */
    private boolean blockedByLatest(List<WillComparisonRow> rowsNewestFirst, Long vaultId) {
        if (rowsNewestFirst.isEmpty()) {
            return true;
        }
        WillComparisonRow latest = rowsNewestFirst.get(0);
        if (!WillComparison.RESULT_MATCH.equals(latest.result())) {
            return true;
        }
        return !comparedScanIsStillCurrent(latest, vaultId);
    }

    /**
     * Bản scan đã đối chiếu còn là phiên bản mới nhất của di chúc đó. Không tìm thấy di chúc thì coi là không còn hiện hành.
     */
    private boolean comparedScanIsStillCurrent(WillComparisonRow comparison, Long vaultId) {
        return willAssetRepository.findWill(comparison.willId(), vaultId)
                .map(will -> assetVersionRepository.findVersions(will.getAssetId()).stream()
                        .noneMatch(v -> v.versionNo() > comparison.version()))
                .orElse(false);
    }

    /**
     * Kiểm tra request đối chiếu: các trường bắt buộc, phiên bản từ 1, lý do tối đa 1000 ký tự; MISMATCH và INCONCLUSIVE
     * bắt buộc có lý do để người sau hiểu vì sao luồng bị chặn.
     *
     * @throws BusinessException {@code VALIDATION_FAILED}
     */
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

    /**
     * Trim chuỗi; trả {@code null} nếu null hoặc rỗng.
     */
    private static String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
