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

    public LegalBasisReviewService(
            LegalBasisDossierRepository dossiers,
            LegalBasisDossierVersionRepository versions,
            LegalBasisVersionAllocationRepository allocations,
            LegalBasisReviewHistoryRepository history,
            AuditService auditService,
            VerificationCaseRepository verificationCases,
            VaultRepository vaultRepository
    ) {
        this.dossiers = dossiers;
        this.versions = versions;
        this.allocations = allocations;
        this.history = history;
        this.auditService = auditService;
        this.verificationCases = verificationCases;
        this.vaultRepository = vaultRepository;
    }

    /**
     * Đánh giá snapshot theo thứ tự khóa Vault -> VerificationCase -> Dossier.
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

        VerificationCase verificationCase = verificationCases
                .findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

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

        VerificationCase verificationCase = verificationCases
                .findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

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
                Vault.STATUS_AWAITING_LEGAL_BASIS.equals(vault.getStatus())
                        || Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(vault.getStatus());

        if (!validVaultState) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        LegalBasisDossier dossier = dossiers
                .findByVerificationCaseIdForUpdate(
                        verificationCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

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

        VerificationCase verificationCase = verificationCases
                .findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

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

        // Kiểm tra hold trước khi kiểm tra trạng thái nghiệp vụ.
        LegalWorkflowGuard.requireNotOnHold(vault, dossier);

        if (!Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(vault.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        if (!LegalBasisDossier.STATUS_FORWARDED.equals(dossier.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        return recordCompletedReviewLocked(
                dossier,
                vault.getVaultId(),
                reviewerUserId,
                reason.trim());
    }


    /**
     * Legal yêu cầu bổ sung hồ sơ và trả hồ sơ về Staff.
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

        VerificationCase verificationCase = verificationCases
                .findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

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

        // Phải chạy trước các kiểm tra trạng thái Vault và dossier.
        LegalWorkflowGuard.requireNotOnHold(vault, dossier);

        if (!Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(vault.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        if (!LegalBasisDossier.STATUS_FORWARDED.equals(dossier.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        String previousVaultStatus = vault.getStatus();
        String previousReviewStatus = dossier.getReviewStatus();

        dossier.requireReview("LEGAL_REQUESTED_SUPPLEMENTATION");
        dossier.markSupplementationRequired();
        dossiers.save(dossier);

        vault.markAwaitingLegalBasisAfterReviewHold();

        history.save(new LegalBasisReviewHistory(
                dossier.getLegalBasisDossierId(),
                null,
                null,
                null,
                dossier.getDisputeStatus(),
                null,
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
                LocalDateTime.now(ZoneOffset.UTC));
    }


    /**
     * So sánh snapshot đã review với dữ liệu hiện tại.
     */
    private LegalBasisReviewResponse evaluateLocked(
            LegalBasisDossier dossier,
            Long vaultId
    ) {
        if (!dossier.acceptsIntake()) throw new BusinessException(ErrorCode.COURT_DECISION_REQUIRED);
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
     */
    private LegalBasisReviewResponse recordCompletedReviewLocked(
            LegalBasisDossier dossier,
            Long vaultId,
            Long reviewerUserId,
            String reason
    ) {
        Long dossierId = dossier.getLegalBasisDossierId();

        List<BasisVersionRow> rows = versions.findRows(dossierId);
        BasisVersionRow current = rows.isEmpty() ? null : rows.get(0);

        if (current == null
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

        history.save(new LegalBasisReviewHistory(
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
                LocalDateTime.now(ZoneOffset.UTC));
    }

    /**
     * Kiểm tra tham số review.
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
     */
    public static String allocationHashFromCanonicalValues(List<String> values) {
        return AllocationScopeHash.hashCanonicalValues(values);
    }

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

