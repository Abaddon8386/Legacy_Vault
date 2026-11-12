package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.LegalBasisReviewResponse;
import com.legacyvault.verification.dto.CompleteLegalBasisReviewRequest;
import com.legacyvault.verification.entity.*;
import com.legacyvault.verification.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Quản lý vòng đời "snapshot xem xét" (review) của hồ sơ căn cứ pháp lý (ST-20, LV-BASIS-001).
 *
 * <p>Một snapshot gồm số phiên bản, SHA-256 chứng cứ, trạng thái tranh chấp và hash phạm vi phân bổ. Service so sánh
 * snapshot đã review lần cuối với dữ liệu hiện tại; nếu lệch thì đánh dấu {@code REVIEW_REQUIRED} (ghi lịch sử và audit
 * {@code LEGAL_BASIS_REVIEW_REQUIRED} với actor SYSTEM). Khi Legal hoàn tất review thì ghi snapshot mới trạng thái
 * {@code FRESH} (audit {@code LEGAL_BASIS_REVIEW_RECORDED}).
 *
 * <p>Điểm vào: {@code LegalBasisDossierController} gọi
 * {@code POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/review}
 * ({@link #recordCompletedReviewByCasePublicId(UUID, Long, CompleteLegalBasisReviewRequest)}) và
 * {@code POST .../basis-dossier/request-supplementation} ({@link #requestSupplementationByCasePublicId}), vai trò
 * LEGAL_VERIFIER. {@code BasisIntakeService} và {@code BasisForwardService} gọi
 * {@code evaluateAfterChange} sau khi dữ liệu thay đổi; {@code DistributionWorkflowService} gọi bản String của {@code recordCompletedReviewByCasePublicId} và {@code requestSupplementationByCasePublicId}. Thứ tự khóa luôn là Vault, VerificationCase, rồi Dossier (FOR UPDATE).
 * Bảng: {@code vaults}, {@code verification_cases}, {@code legal_basis_dossiers}, các bảng phiên bản, phân bổ, lịch sử
 * review.
 */
@Service
public class LegalBasisReviewService {

    /**
     * Loại thực thể ghi trong audit.
     */
    private static final String ENTITY_TYPE = "LEGAL_BASIS_DOSSIER";
    /**
     * Mã bước quy trình ghi vào audit.
     */
    private static final String STEP_ID = "ST-20";
    /**
     * Mã quy tắc nghiệp vụ ghi vào audit.
     */
    private static final String RULE_ID = "LV-BASIS-001";

    private final LegalBasisDossierRepository dossiers;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalBasisVersionAllocationRepository allocations;
    private final LegalBasisReviewHistoryRepository history;
    private final AuditService auditService;
    private final VerificationCaseRepository verificationCases;
    private final VaultRepository vaultRepository;
    private final LegalBasisLockedState lockedState;
    private final com.legacyvault.notification.WorkflowNotificationService notifications;

    /**
     * @param dossiers repository hồ sơ căn cứ (có truy vấn khóa ghi)
     * @param versions repository phiên bản hồ sơ căn cứ
     * @param allocations repository dòng phân bổ theo phiên bản
     * @param history repository lịch sử review
     * @param auditService dịch vụ ghi nhật ký kiểm toán
     * @param verificationCases repository hồ sơ xác minh
     * @param vaultRepository repository Vault
     * @param lockedState tiện ích refresh entity sau khi khóa
     * @param notifications dịch vụ thông báo workflow
     */
    public LegalBasisReviewService(
            LegalBasisDossierRepository dossiers,
            LegalBasisDossierVersionRepository versions,
            LegalBasisVersionAllocationRepository allocations,
            LegalBasisReviewHistoryRepository history,
            AuditService auditService,
            VerificationCaseRepository verificationCases,
            VaultRepository vaultRepository,
            LegalBasisLockedState lockedState,
            com.legacyvault.notification.WorkflowNotificationService notifications
    ) {
        this.dossiers = dossiers;
        this.versions = versions;
        this.allocations = allocations;
        this.history = history;
        this.auditService = auditService;
        this.verificationCases = verificationCases;
        this.vaultRepository = vaultRepository;
        this.lockedState = lockedState;
        this.notifications = notifications;
    }

    /**
     * Đánh giá snapshot theo thứ tự khóa Vault -> VerificationCase -> Dossier, bắt đầu từ id nội bộ của dossier.
     *
     * @param dossierId id nội bộ của hồ sơ căn cứ
     * @return kết quả đánh giá (khớp hoặc REVIEW_REQUIRED)
     * @throws BusinessException {@code VALIDATION_FAILED}, {@code RESOURCE_NOT_FOUND}, {@code VERIFICATION_CASE_NOT_OPEN}
     *         khi case đóng, {@code BASIS_DOSSIER_INVALID_STATE} khi Vault đang ON_HOLD, hoặc
     *         {@code COURT_DECISION_REQUIRED} khi tuyến tòa chưa có quyết định
     */
    @Transactional
    public LegalBasisReviewResponse evaluate(Long dossierId) {
        if (dossierId == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        LegalBasisDossier initialDossier = dossiers.findById(dossierId)
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        VerificationCase initialCase = verificationCases
                .findById(initialDossier.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        Vault vault = vaultRepository
                .findByIdForUpdate(initialCase.getVaultId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(vault);

        VerificationCase verificationCase = verificationCases
                .findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(verificationCase);

        if (!Objects.equals(verificationCase.getVaultId(), vault.getVaultId())) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }

        if (!verificationCase.isOpen()) {
            throw new BusinessException(ErrorCode.VERIFICATION_CASE_NOT_OPEN);
        }

        LegalBasisDossier dossier = dossiers
                .findByVerificationCaseIdForUpdate(
                        verificationCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(dossier);

        if (!Objects.equals(dossier.getLegalBasisDossierId(), dossierId)) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }

        if (Vault.STATUS_ON_HOLD.equals(vault.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        return evaluateLocked(dossier, vault.getVaultId());
    }

    /**
     * Đánh giá lại snapshot theo public id của case sau khi có thay đổi (tải phiên bản mới, forward, đổi phân bổ...). Khóa
     * Vault, case, dossier; yêu cầu case mở, Vault không ON_HOLD và ở trạng thái nhận hồ sơ hoặc LEGAL_BASIS_VERIFICATION;
     * dossier phải PROVIDED hoặc FORWARDED.
     *
     * @param casePublicId public id của hồ sơ xác minh
     * @return kết quả đánh giá
     * @throws BusinessException {@code VALIDATION_FAILED}, {@code RESOURCE_NOT_FOUND}, {@code VERIFICATION_CASE_NOT_OPEN},
     *         {@code BASIS_DOSSIER_INVALID_STATE}
     */
    @Transactional
    public LegalBasisReviewResponse evaluateAfterChange(UUID casePublicId) {
        if (casePublicId == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        VerificationCase initialCase = verificationCases
                .findByPublicId(casePublicId)
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        Vault vault = vaultRepository
                .findByIdForUpdate(initialCase.getVaultId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(vault);

        VerificationCase verificationCase = verificationCases
                .findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(verificationCase);

        if (!Objects.equals(verificationCase.getPublicId(), casePublicId)
                || !Objects.equals(verificationCase.getVaultId(), vault.getVaultId())) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }

        if (!verificationCase.isOpen()) {
            throw new BusinessException(ErrorCode.VERIFICATION_CASE_NOT_OPEN);
        }

        if (Vault.STATUS_ON_HOLD.equals(vault.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        boolean validVaultState =
                vault.isLegalBasisIntakeState()
                        || Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(vault.getStatus());

        if (!validVaultState) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        LegalBasisDossier dossier = dossiers
                .findByVerificationCaseIdForUpdate(
                        verificationCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(dossier);

        boolean validDossierState =
                LegalBasisDossier.STATUS_PROVIDED.equals(dossier.getStatus())
                        || LegalBasisDossier.STATUS_FORWARDED.equals(dossier.getStatus());

        if (!validDossierState) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        return evaluateLocked(dossier, vault.getVaultId());
    }

    /**
     * Đánh giá dossier mà caller đã khóa Vault/case trước đó; chỉ khóa lại dossier theo id rồi refresh.
     *
     * @param dossierId id nội bộ của hồ sơ căn cứ
     * @param vaultId id nội bộ của Vault (dùng khi ghi audit)
     * @return kết quả đánh giá
     * @throws BusinessException {@code VALIDATION_FAILED} khi thiếu tham số; {@code RESOURCE_NOT_FOUND}
     */
    @Transactional
    public LegalBasisReviewResponse evaluateAfterChange(
            Long dossierId,
            Long vaultId
    ) {
        if (dossierId == null || vaultId == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        LegalBasisDossier dossier = dossiers
                .findByDossierIdForUpdate(dossierId)
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(dossier);

        return evaluateLocked(dossier, vaultId);
    }

    /**
     * Ghi nhận review hoàn tất theo verification case, không kiểm tra snapshot kỳ vọng (dành cho caller nội bộ).
     *
     * @param casePublicId public id của hồ sơ xác minh
     * @param reviewerUserId id người review
     * @param reason lý do/ghi chú review (không rỗng, tối đa 1000 ký tự)
     * @return kết quả review
     * @throws BusinessException xem {@code completeReview}
     */
    @Transactional
    public LegalBasisReviewResponse recordCompletedReviewByCasePublicId(
            UUID casePublicId,
            Long reviewerUserId,
            String reason
    ) {
        return completeReview(casePublicId, reviewerUserId, reason, null);
    }

    /**
     * Ghi nhận review hoàn tất qua biên HTTP. Bắt buộc đúng snapshot đang hiển thị: số phiên bản, SHA-256 và hash phân
     * bổ (64 ký tự hex) và trạng thái tranh chấp (NONE, DISPUTED, UNDETERMINED). Bản overload nhận String chỉ dành cho caller
     * nội bộ tin cậy.
     *
     * @param casePublicId public id của hồ sơ xác minh
     * @param reviewerUserId id người dùng Legal Verifier
     * @param expected snapshot kỳ vọng kèm lý do
     * @return kết quả review (FRESH)
     * @throws BusinessException {@code VALIDATION_FAILED} khi snapshot sai định dạng; {@code LEGAL_DECISION_STALE} khi
     *         snapshot không còn khớp dữ liệu hiện tại; các lỗi trạng thái khác như ở {@code completeReview}
     */
    @Transactional
    public LegalBasisReviewResponse recordCompletedReviewByCasePublicId(UUID casePublicId, Long reviewerUserId,
            CompleteLegalBasisReviewRequest expected) {
        if (expected == null || expected.versionNo() == null || expected.versionNo() < 1
                || expected.sha256Hash() == null || !expected.sha256Hash().matches("[a-fA-F0-9]{64}")
                || expected.allocationHash() == null || !expected.allocationHash().matches("[a-fA-F0-9]{64}")
                || expected.disputeStatus() == null || !java.util.Set.of("NONE","DISPUTED","UNDETERMINED").contains(expected.disputeStatus()))
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        return completeReview(casePublicId, reviewerUserId, expected.reason(), expected);
    }

    /**
     * Thực hiện review hoàn tất: kiểm tra đầu vào, khóa Vault -> case -> dossier, kiểm tra hold, tuyến tòa
     * ({@code COURT_DECISION_REQUIRED}), Vault ở LEGAL_BASIS_VERIFICATION và dossier FORWARDED; nếu có snapshot kỳ vọng thì
     * đối chiếu với phiên bản mới nhất; cuối cùng gọi {@code recordCompletedReviewLocked}.
     *
     * @param expected snapshot kỳ vọng hoặc {@code null} khi gọi từ nội bộ
     * @throws BusinessException {@code VALIDATION_FAILED}, {@code RESOURCE_NOT_FOUND}, {@code VERIFICATION_CASE_NOT_OPEN},
     *         {@code BASIS_DOSSIER_INVALID_STATE}, {@code LEGAL_DECISION_STALE}
     */
    private LegalBasisReviewResponse completeReview(UUID casePublicId, Long reviewerUserId, String reason,
            CompleteLegalBasisReviewRequest expected) {
        validateReviewInput(casePublicId, reviewerUserId, reason);

        VerificationCase initialCase = verificationCases
                .findByPublicId(casePublicId)
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        // Khóa theo thứ tự: Vault -> VerificationCase -> Dossier.
        Vault vault = vaultRepository
                .findByIdForUpdate(initialCase.getVaultId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(vault);

        VerificationCase verificationCase = verificationCases
                .findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(verificationCase);

        if (!Objects.equals(verificationCase.getPublicId(), casePublicId)
                || !Objects.equals(
                verificationCase.getVaultId(), vault.getVaultId())) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }

        if (!verificationCase.isOpen()) {
            throw new BusinessException(ErrorCode.VERIFICATION_CASE_NOT_OPEN);
        }

        LegalBasisDossier dossier = dossiers
                .findByVerificationCaseIdForUpdate(
                        verificationCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(dossier);

        // Kiểm tra hold trước khi kiểm tra trạng thái nghiệp vụ.
        LegalWorkflowGuard.requireNotOnHold(vault, dossier);
        if (!dossier.isLegalReviewable()) throw new BusinessException(ErrorCode.COURT_DECISION_REQUIRED);

        if (!Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(vault.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        if (!LegalBasisDossier.STATUS_FORWARDED.equals(dossier.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        if (expected != null) {
            var rows = versions.findRows(dossier.getLegalBasisDossierId());
            var current = rows.isEmpty() ? null : rows.getFirst();
            if (current == null || !Objects.equals(expected.versionNo(), current.versionNo())
                    || !expected.sha256Hash().equalsIgnoreCase(current.sha256Hash())
                    || !expected.allocationHash().equalsIgnoreCase(allocationHash(dossier.getLegalBasisDossierId(), current.versionNo()))
                    || !expected.disputeStatus().equals(dossier.getDisputeStatus()))
                throw new BusinessException(ErrorCode.LEGAL_DECISION_STALE);
        }

        return recordCompletedReviewLocked(
                dossier,
                vault.getVaultId(),
                reviewerUserId,
                reason.trim(), verificationCase);
    }


    /**
     * Legal yêu cầu bổ sung hồ sơ và trả hồ sơ về Staff.
     * API: {@code POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/request-supplementation}
     * (LEGAL_VERIFIER).
     *
     * <p>Các bước: kiểm tra lý do (không rỗng, tối đa 1000 ký tự); khóa Vault -> case -> dossier; kiểm tra hold TRƯỚC các
     * kiểm tra trạng thái, tuyến tòa, Vault ở LEGAL_BASIS_VERIFICATION và dossier FORWARDED; đánh dấu dossier cần review và
     * cần bổ sung; chuyển Vault về trạng thái chờ căn cứ; lưu lịch sử review; ghi audit {@code LEGAL_BASIS_REVIEW_REQUIRED};
     * gửi thông báo {@code LEGAL_BASIS_REVIEW_REQUIRED} cho Staff.
     *
     * @param casePublicId public id của hồ sơ xác minh
     * @param reviewerUserId id Legal Verifier
     * @param reason lý do yêu cầu bổ sung
     * @return kết quả với trạng thái REVIEW_REQUIRED
     * @throws BusinessException {@code VALIDATION_FAILED}, {@code RESOURCE_NOT_FOUND}, {@code VERIFICATION_CASE_NOT_OPEN},
     *         {@code COURT_DECISION_REQUIRED}, {@code BASIS_DOSSIER_INVALID_STATE}
     */
    @Transactional
    public LegalBasisReviewResponse requestSupplementationByCasePublicId(
            UUID casePublicId,
            Long reviewerUserId,
            String reason
    ) {
        if (casePublicId == null
                || reviewerUserId == null
                || reason == null
                || reason.isBlank()
                || reason.trim().length() > 1000) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        VerificationCase initialCase = verificationCases
                .findByPublicId(casePublicId)
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        // Khóa theo thứ tự: Vault -> VerificationCase -> Dossier.
        Vault vault = vaultRepository
                .findByIdForUpdate(initialCase.getVaultId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(vault);

        VerificationCase verificationCase = verificationCases
                .findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(verificationCase);

        if (!Objects.equals(verificationCase.getPublicId(), casePublicId)
                || !Objects.equals(
                verificationCase.getVaultId(), vault.getVaultId())) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }

        if (!verificationCase.isOpen()) {
            throw new BusinessException(ErrorCode.VERIFICATION_CASE_NOT_OPEN);
        }

        LegalBasisDossier dossier = dossiers
                .findByVerificationCaseIdForUpdate(
                        verificationCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        lockedState.refresh(dossier);

        // Phải chạy trước các kiểm tra trạng thái Vault và dossier.
        LegalWorkflowGuard.requireNotOnHold(vault, dossier);
        if (!dossier.isLegalReviewable()) throw new BusinessException(ErrorCode.COURT_DECISION_REQUIRED);

        if (!Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(vault.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        if (!LegalBasisDossier.STATUS_FORWARDED.equals(dossier.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        String previousVaultStatus = vault.getStatus();
        String previousReviewStatus = dossier.getReviewStatus();

        var sourceVersion = versions.findRows(dossier.getLegalBasisDossierId()).stream().findFirst().orElse(null);
        String sourceAllocationHash = sourceVersion == null ? null : allocationHash(dossier.getLegalBasisDossierId(), sourceVersion.versionNo());
        dossier.requireReview("LEGAL_REQUESTED_SUPPLEMENTATION");
        dossier.markSupplementationRequired();
        dossiers.save(dossier);

        vault.markAwaitingLegalBasisAfterReviewHold();

        var savedReview = history.saveAndFlush(new LegalBasisReviewHistory(
                dossier.getLegalBasisDossierId(),
                null,
                sourceVersion == null ? null : sourceVersion.versionNo(),
                sourceVersion == null ? null : sourceVersion.sha256Hash(),
                dossier.getDisputeStatus(),
                sourceAllocationHash,
                LegalBasisReviewStatus.REVIEW_REQUIRED.name(),
                "LEGAL_REQUESTED_SUPPLEMENTATION",
                reason.trim(),
                reviewerUserId));

        auditService.record(new AuditEvent(
                AuditAction.LEGAL_BASIS_REVIEW_REQUIRED,
                AuditActorType.USER,
                reviewerUserId,
                vault.getVaultId(),
                ENTITY_TYPE,
                dossier.getLegalBasisDossierId(),
                previousReviewStatus,
                LegalBasisReviewStatus.REVIEW_REQUIRED.name(),
                null,
                Map.of(
                        "reasonCode", "LEGAL_REQUESTED_SUPPLEMENTATION",
                        "vaultStatusBefore", previousVaultStatus,
                        "vaultStatusAfter", vault.getStatus(),
                        "verificationCaseId", verificationCase.getPublicId().toString()),
                STEP_ID,
                RULE_ID));

        return new LegalBasisReviewResponse(
                dossier.getPublicId(),
                LegalBasisReviewStatus.REVIEW_REQUIRED.name(),
                true,
                "LEGAL_REQUESTED_SUPPLEMENTATION",
                reason.trim(),
                dossier.getLastReviewedVersionNo(),
                dossier.getLastReviewedSha256Hash(),
                dossier.getDisputeStatus(),
                dossier.getLastReviewedAllocationHash(),
                LocalDateTime.now(ZoneOffset.UTC)).withNotification(notifications.record(verificationCase,
                        com.legacyvault.notification.WorkflowNotificationService.Workspace.STAFF,
                        "LEGAL_BASIS_REVIEW_REQUIRED", "basis-review:" + savedReview.getPublicId(), reason.trim()));
    }


    /**
     * So sánh snapshot đã review lần cuối với dữ liệu hiện tại của dossier đã khóa.
     *
     * <p>Thứ tự phát hiện lệch: chưa có snapshot (NO_REVIEW_SNAPSHOT), đổi phiên bản (DOSSIER_VERSION_CHANGED), đổi hash
     * chứng cứ (EVIDENCE_HASH_CHANGED), đổi trạng thái tranh chấp (DISPUTE_STATUS_CHANGED), đổi phạm vi phân bổ
     * (ALLOCATION_SCOPE_CHANGED). Nếu lệch thì gọi {@code markRequired}; nếu khớp thì trả SNAPSHOT_MATCHES.
     *
     * @param dossier dossier đã khóa
     * @param vaultId id Vault dùng cho audit
     * @return kết quả đánh giá
     * @throws BusinessException {@code COURT_DECISION_REQUIRED} khi dossier chưa thể xem xét
     */
    private LegalBasisReviewResponse evaluateLocked(
            LegalBasisDossier dossier,
            Long vaultId
    ) {
        if (!dossier.isLegalReviewable()) throw new BusinessException(ErrorCode.COURT_DECISION_REQUIRED);
        Long dossierId = dossier.getLegalBasisDossierId();

        List<BasisVersionRow> rows = versions.findRows(dossierId);
        BasisVersionRow current = rows.isEmpty() ? null : rows.get(0);

        if (current == null
                || current.sha256Hash() == null
                || current.sha256Hash().isBlank()) {
            return markRequired(
                    dossier,
                    vaultId,
                    null,
                    null,
                    "CURRENT_VERSION_UNAVAILABLE",
                    "Không đủ dữ liệu phiên bản hiện tại để xác minh snapshot.");
        }

        String currentAllocationHash = allocationHash(dossierId, current.versionNo());

        String reasonCode = null;
        String reason = null;

        if (dossier.getLastReviewedVersionNo() == null
                || dossier.getLastReviewedSha256Hash() == null
                || dossier.getLastReviewedAllocationHash() == null
                || dossier.getLastReviewedDisputeStatus() == null) {
            reasonCode = "NO_REVIEW_SNAPSHOT";
            reason = "Chưa có snapshot review đầy đủ cho dossier.";
        } else if (!Objects.equals(
                dossier.getLastReviewedVersionNo(), current.versionNo())) {
            reasonCode = "DOSSIER_VERSION_CHANGED";
            reason = "Phiên bản dossier đã thay đổi kể từ lần review trước.";
        } else if (!dossier.getLastReviewedSha256Hash()
                .equalsIgnoreCase(current.sha256Hash())) {
            reasonCode = "EVIDENCE_HASH_CHANGED";
            reason = "Hash chứng cứ hiện tại khác hash đã review.";
        } else if (!Objects.equals(
                dossier.getLastReviewedDisputeStatus(),
                dossier.getDisputeStatus())) {
            reasonCode = "DISPUTE_STATUS_CHANGED";
            reason = "Trạng thái tranh chấp đã thay đổi kể từ lần review trước.";
        } else if (!dossier.getLastReviewedAllocationHash()
                .equals(currentAllocationHash)) {
            reasonCode = "ALLOCATION_SCOPE_CHANGED";
            reason = "Phạm vi tài sản hoặc beneficiary đã thay đổi.";
        }

        if (reasonCode != null) {
            return markRequired(
                    dossier,
                    vaultId,
                    current,
                    currentAllocationHash,
                    reasonCode,
                    reason);
        }

        boolean reviewRequired =
                !LegalBasisReviewStatus.FRESH.name().equals(dossier.getReviewStatus());

        return new LegalBasisReviewResponse(
                dossier.getPublicId(),
                dossier.getReviewStatus(),
                reviewRequired,
                "SNAPSHOT_MATCHES",
                "Snapshot version, hash, dispute và allocation khớp.",
                current.versionNo(),
                current.sha256Hash(),
                dossier.getDisputeStatus(),
                currentAllocationHash,
                LocalDateTime.now(ZoneOffset.UTC));
    }

    /**
     * Đánh dấu dossier REVIEW_REQUIRED với mã lý do. Chỉ khi trạng thái hoặc lý do thực sự đổi mới ghi lịch sử review và
     * audit {@code LEGAL_BASIS_REVIEW_REQUIRED} (actor SYSTEM) để tránh ghi trùng.
     *
     * @param current phiên bản hiện hành hoặc {@code null}
     * @param currentAllocationHash hash phân bổ hiện tại hoặc {@code null}
     * @param reasonCode mã lý do
     * @param reason mô tả lý do
     * @return kết quả với reviewRequired = true
     */
    private LegalBasisReviewResponse markRequired(
            LegalBasisDossier dossier,
            Long vaultId,
            BasisVersionRow current,
            String currentAllocationHash,
            String reasonCode,
            String reason
    ) {
        String previousStatus = dossier.getReviewStatus();
        String previousReason = dossier.getReviewRequiredReason();

        dossier.requireReview(reasonCode);
        dossiers.save(dossier);

        boolean changed =
                !LegalBasisReviewStatus.REVIEW_REQUIRED.name().equals(previousStatus)
                        || !Objects.equals(previousReason, reasonCode);

        if (changed) {
            Long versionId = null;

            if (current != null) {
                versionId = versions
                        .findByLegalBasisDossierIdAndVersionNo(
                                dossier.getLegalBasisDossierId(),
                                current.versionNo())
                        .map(LegalBasisDossierVersion::getDossierVersionId)
                        .orElse(null);
            }

            history.save(new LegalBasisReviewHistory(
                    dossier.getLegalBasisDossierId(),
                    versionId,
                    current == null ? null : current.versionNo(),
                    current == null ? null : current.sha256Hash(),
                    dossier.getDisputeStatus(),
                    currentAllocationHash,
                    LegalBasisReviewStatus.REVIEW_REQUIRED.name(),
                    reasonCode,
                    reason,
                    null));

            auditService.record(new AuditEvent(
                    AuditAction.LEGAL_BASIS_REVIEW_REQUIRED,
                    AuditActorType.SYSTEM,
                    null,
                    vaultId,
                    ENTITY_TYPE,
                    dossier.getLegalBasisDossierId(),
                    previousStatus,
                    LegalBasisReviewStatus.REVIEW_REQUIRED.name(),
                    null,
                    Map.of("reasonCode", reasonCode, "reason", reason),
                    STEP_ID,
                    RULE_ID));
        }

        return new LegalBasisReviewResponse(
                dossier.getPublicId(),
                dossier.getReviewStatus(),
                true,
                reasonCode,
                reason,
                current == null ? null : current.versionNo(),
                current == null ? null : current.sha256Hash(),
                dossier.getDisputeStatus(),
                currentAllocationHash,
                LocalDateTime.now(ZoneOffset.UTC));
    }

    /**
     * Ghi snapshot hiện tại làm snapshot đã review, lưu lịch sử (FRESH, REVIEW_COMPLETED), ghi audit
     * {@code LEGAL_BASIS_REVIEW_RECORDED} và gửi thông báo {@code LEGAL_BASIS_REVIEW_RECORDED} cho Staff.
     *
     * @throws BusinessException {@code COURT_DECISION_REQUIRED}; {@code BASIS_DOSSIER_INVALID_STATE} khi phiên bản mới nhất
     *         chưa FORWARDED, thấp hơn phiên bản yêu cầu hoặc thiếu SHA-256; {@code RESOURCE_NOT_FOUND}
     */
    private LegalBasisReviewResponse recordCompletedReviewLocked(
            LegalBasisDossier dossier,
            Long vaultId,
            Long reviewerUserId,
            String reason, VerificationCase verificationCase
    ) {
        if (!dossier.isLegalReviewable()) throw new BusinessException(ErrorCode.COURT_DECISION_REQUIRED);
        Long dossierId = dossier.getLegalBasisDossierId();

        List<BasisVersionRow> rows = versions.findRows(dossierId);
        BasisVersionRow current = rows.isEmpty() ? null : rows.get(0);

        if (current == null
                || current.versionNo() < dossier.getRequiredVersionNo()
                || !"FORWARDED".equals(current.forwardStatus())
                || current.sha256Hash() == null
                || current.sha256Hash().isBlank()) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        String currentAllocationHash = allocationHash(dossierId, current.versionNo());
        String previousStatus = dossier.getReviewStatus();

        dossier.recordReviewSnapshot(
                current.versionNo(),
                current.sha256Hash(),
                dossier.getDisputeStatus(),
                currentAllocationHash,
                reviewerUserId);

        dossiers.save(dossier);

        LegalBasisDossierVersion version = versions
                .findByLegalBasisDossierIdAndVersionNo(dossierId, current.versionNo())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        var savedReview = history.saveAndFlush(new LegalBasisReviewHistory(
                dossierId,
                version.getDossierVersionId(),
                current.versionNo(),
                current.sha256Hash(),
                dossier.getDisputeStatus(),
                currentAllocationHash,
                LegalBasisReviewStatus.FRESH.name(),
                "REVIEW_COMPLETED",
                reason,
                reviewerUserId));

        auditService.record(new AuditEvent(
                AuditAction.LEGAL_BASIS_REVIEW_RECORDED,
                AuditActorType.USER,
                reviewerUserId,
                vaultId,
                ENTITY_TYPE,
                dossierId,
                previousStatus,
                LegalBasisReviewStatus.FRESH.name(),
                null,
                Map.of(
                        "versionNo", current.versionNo(),
                        "reasonCode", "REVIEW_COMPLETED"),
                STEP_ID,
                RULE_ID));

        return new LegalBasisReviewResponse(
                dossier.getPublicId(),
                LegalBasisReviewStatus.FRESH.name(),
                false,
                "REVIEW_COMPLETED",
                reason,
                current.versionNo(),
                current.sha256Hash(),
                dossier.getDisputeStatus(),
                currentAllocationHash,
                LocalDateTime.now(ZoneOffset.UTC)).withNotification(notifications.record(verificationCase,
                        com.legacyvault.notification.WorkflowNotificationService.Workspace.STAFF,
                        "LEGAL_BASIS_REVIEW_RECORDED", "basis-review:" + savedReview.getPublicId(), reason));
    }

    /**
     * Kiểm tra tham số review: case, reviewer không null, lý do không rỗng và tối đa 1000 ký tự.
     *
     * @throws BusinessException {@code VALIDATION_FAILED}
     */
    private void validateReviewInput(
            UUID casePublicId,
            Long reviewerUserId,
            String reason
    ) {
        if (casePublicId == null
                || reviewerUserId == null
                || reason == null
                || reason.isBlank()
                || reason.trim().length() > 1000) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }
    }

    /**
     * Tạo hash ổn định cho tập giá trị chuẩn hóa của các dòng phân bổ (ủy quyền cho {@code AllocationScopeHash}).
     *
     * @param values các giá trị chuẩn hóa
     * @return chuỗi hash
     */
    public static String allocationHashFromCanonicalValues(List<String> values) {
        return AllocationScopeHash.hashCanonicalValues(values);
    }

    /**
     * Tính hash phạm vi phân bổ của phiên bản {@code versionNo} trong dossier từ các dòng phân bổ.
     */
    private String allocationHash(Long dossierId, int versionNo) {
        List<String> scope = allocations.findRowsByDossier(dossierId).stream()
                .filter(row -> row.versionNo() == versionNo)
                .map(this::allocationCanonicalValue)
                .toList();

        return allocationHashFromCanonicalValues(scope);
    }

    /**
     * Chuẩn hóa một dòng phân bổ (tài sản, beneficiary, mô tả) thành chuỗi dùng để tính hash.
     */
    private String allocationCanonicalValue(AllocationRow row) {
        return AllocationScopeHash.canonicalValue(row.assetId(), row.beneficiaryId(), row.description());
    }
}

