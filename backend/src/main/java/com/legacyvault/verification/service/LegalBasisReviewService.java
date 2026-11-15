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
 * Nghiệp vụ ST-20 / PS-37 (LV-BASIS-001): quản lý snapshot review hồ sơ căn cứ của Legal.
 *
 * Snapshot gồm số phiên bản, sha256 chứng cứ, trạng thái tranh chấp và allocation hash. Khi dữ liệu hiện tại lệch snapshot,
 * hồ sơ chuyển REVIEW_REQUIRED (kết quả nghiệp vụ hợp lệ, không phải exception); khi Legal hoàn tất review thì ghi snapshot mới (FRESH).
 * Các thao tác ghi đều khóa theo thứ tự Vault -> VerificationCase -> Dossier.
 */
@Service
public class LegalBasisReviewService {

    private static final String ENTITY_TYPE = "LEGAL_BASIS_DOSSIER";
    private static final String STEP_ID = "ST-20";
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
     * Đánh giá snapshot theo thứ tự khóa Vault -> VerificationCase -> Dossier.
     */
    // Đánh giá snapshot theo id hồ sơ: đọc không khóa để biết Vault/ca cần khóa, rồi khóa theo thứ tự chuẩn và kiểm tra lại quan hệ sau khi khóa.
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
     * Đánh giá lại snapshot theo verification case sau khi có thay đổi.
     *
     * Được gọi sau khi dữ liệu hồ sơ thay đổi (ví dụ BasisForwardService.forward). Ca phải mở, Vault không ON_HOLD
     * và ở trạng thái tiếp nhận căn cứ hoặc LEGAL_BASIS_VERIFICATION, hồ sơ ở PROVIDED/FORWARDED.
     * @return kết quả đánh giá; REVIEW_REQUIRED nếu snapshot không còn khớp
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
     * Đánh giá dossier đã được caller khóa.
     *
     * Dành cho caller đã tự khóa Vault/ca: ở đây chỉ khóa thêm hồ sơ (cuối chuỗi Vault -> ca -> hồ sơ) rồi đánh giá.
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
     * Ghi nhận review hoàn tất theo verification case.
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
     * Overload nhận String chỉ dành cho caller nội bộ tin cậy.
     *
     * Điểm vào HTTP: bắt buộc client gửi đúng snapshot đã hiển thị (version, sha256 64 hex, allocation hash 64 hex, dispute status hợp lệ)
     * để Legal không xác nhận review trên dữ liệu đã bị thay đổi. Sai định dạng -> VALIDATION_FAILED; lệch dữ liệu hiện tại -> LEGAL_DECISION_STALE.
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
     * Luồng chung ghi nhận review hoàn tất: khóa Vault -> ca -> hồ sơ, kiểm tra không ON_HOLD, hồ sơ đủ căn cứ để xem xét, Vault LEGAL_BASIS_VERIFICATION
     * và hồ sơ FORWARDED, đối chiếu snapshot client (nếu có) rồi ghi snapshot mới.
     * @param expected snapshot client đã xem; null khi caller nội bộ tin cậy gọi qua overload String
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
        // Hồ sơ chưa đủ căn cứ (ví dụ chưa có quyết định tòa án hợp lệ) thì chưa thể review.
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
     *
     * Legal trả hồ sơ về Staff để bổ sung chứng cứ (PS-37).
     * Xử lý: khóa Vault -> ca -> hồ sơ; hồ sơ phải FORWARDED và Vault LEGAL_BASIS_VERIFICATION; đặt review REVIEW_REQUIRED với lý do
     * LEGAL_REQUESTED_SUPPLEMENTATION, đưa Vault về trạng thái chờ căn cứ, lưu lịch sử, ghi audit và thông báo cho Staff.
     * @param reason lý do bắt buộc, tối đa 1000 ký tự
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
     * So sánh snapshot đã review với dữ liệu hiện tại.
     *
     * So sánh snapshot đã review với dữ liệu hiện tại của hồ sơ (đã được caller khóa). Thứ tự kiểm tra lệch:
     * chưa có snapshot -> NO_REVIEW_SNAPSHOT; đổi phiên bản -> DOSSIER_VERSION_CHANGED; đổi sha256 -> EVIDENCE_HASH_CHANGED;
     * đổi tranh chấp -> DISPUTE_STATUS_CHANGED; đổi phạm vi phân bổ -> ALLOCATION_SCOPE_CHANGED. Có lệch thì đánh dấu REVIEW_REQUIRED.
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
     * Đánh dấu REVIEW_REQUIRED và ghi history/audit.
     *
     * Đánh dấu hồ sơ cần review lại. Chỉ ghi history và audit (actor SYSTEM) khi trạng thái hoặc lý do thực sự thay đổi, để đánh giá lặp lại không tạo bản ghi trùng.
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
     * Ghi snapshot, lịch sử review và audit sau khi reviewer hoàn tất.
     *
     * Ghi snapshot review mới (FRESH) cho phiên bản mới nhất sau khi Legal hoàn tất, lưu lịch sử REVIEW_COMPLETED, ghi audit và thông báo cho Staff.
     * Phiên bản mới nhất phải đã FORWARDED, có sha256 và đạt requiredVersionNo.
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
     * Kiểm tra tham số review.
     *
     * Kiểm tra tham số review: case, reviewer và lý do (không trống, tối đa 1000 ký tự).
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
     * Tạo hash ổn định cho các dòng phân bổ.
     *
     * Băm các giá trị canonical của phân bổ; ủy quyền cho AllocationScopeHash để mọi nơi dùng chung một công thức.
     */
    public static String allocationHashFromCanonicalValues(List<String> values) {
        return AllocationScopeHash.hashCanonicalValues(values);
    }

    /**
     * Allocation hash của phân bổ hiện hành đúng phiên bản (loại dòng SUPERSEDED).
     */
    private String allocationHash(Long dossierId, int versionNo) {
        List<String> scope = allocations.findRowsByDossier(dossierId).stream()
                .filter(row -> row.versionNo() == versionNo)
                .map(this::allocationCanonicalValue)
                .toList();

        return allocationHashFromCanonicalValues(scope);
    }

    private String allocationCanonicalValue(AllocationRow row) {
        return AllocationScopeHash.canonicalValue(row.assetId(), row.beneficiaryId(), row.description());
    }
}

