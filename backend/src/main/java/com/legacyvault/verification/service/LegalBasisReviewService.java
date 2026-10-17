
package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.LegalBasisReviewResponse;
import com.legacyvault.verification.entity.*;
import com.legacyvault.verification.repository.*;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.stream.Collectors;

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
     * Vị trí: phương thức public đầu tiên trong class.
     * Đánh giá snapshot hiện tại và đánh dấu cần review lại nếu phát hiện thay đổi.
     */
    @Transactional
    public LegalBasisReviewResponse evaluate(Long dossierId) {
        LegalBasisDossier dossier = dossiers.findByDossierIdForUpdate(dossierId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        List<BasisVersionRow> rows = versions.findRows(dossierId);
        BasisVersionRow current = rows.isEmpty() ? null : rows.get(0);

        if (current == null || current.sha256Hash() == null
                || current.sha256Hash().isBlank()) {
            return markRequired(
                    dossier, null, null, "CURRENT_VERSION_UNAVAILABLE",
                    "Không đủ dữ liệu phiên bản hiện tại để xác minh snapshot."
            );
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
        } else if (!Objects.equals(dossier.getLastReviewedVersionNo(), current.versionNo())) {
            reasonCode = "DOSSIER_VERSION_CHANGED";
            reason = "Phiên bản dossier đã thay đổi kể từ lần review trước.";
        } else if (!dossier.getLastReviewedSha256Hash().equalsIgnoreCase(current.sha256Hash())) {
            reasonCode = "EVIDENCE_HASH_CHANGED";
            reason = "Hash chứng cứ hiện tại khác hash đã review.";
        } else if (!Objects.equals(
                dossier.getLastReviewedDisputeStatus(), dossier.getDisputeStatus())) {
            reasonCode = "DISPUTE_STATUS_CHANGED";
            reason = "Trạng thái tranh chấp đã thay đổi kể từ lần review trước.";
        } else if (!dossier.getLastReviewedAllocationHash().equals(currentAllocationHash)) {
            reasonCode = "ALLOCATION_SCOPE_CHANGED";
            reason = "Phạm vi tài sản hoặc beneficiary đã thay đổi.";
        }

        if (reasonCode != null) {
            return markRequired(dossier, current, currentAllocationHash, reasonCode, reason);
        }

        return new LegalBasisReviewResponse(
                dossier.getLegalBasisDossierId(),
                dossier.getReviewStatus(),
                !LegalBasisReviewStatus.FRESH.name().equals(dossier.getReviewStatus()),
                "SNAPSHOT_MATCHES",
                "Snapshot version, hash, dispute và allocation khớp.",
                current.versionNo(),
                current.sha256Hash(),
                dossier.getDisputeStatus(),
                currentAllocationHash,
                LocalDateTime.now(ZoneOffset.UTC)
        );
    }

    /**
     * Vị trí: phương thức public thứ hai trong class.
     * Ghi snapshot sau khi quy trình review pháp lý thực tế đã hoàn thành.
     *
     * Chỉ gọi từ luồng được bảo vệ quyền reviewer; reviewerUserId phải lấy từ principal ở server.
     */
    @Transactional
    public LegalBasisReviewResponse recordCompletedReview(
            Long dossierId,
            Long reviewerUserId,
            String reason
    ) {
        if (reviewerUserId == null
                || reason == null
                || reason.isBlank()
                || reason.length() > 1000) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        LegalBasisDossier dossier = dossiers.findByDossierIdForUpdate(dossierId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        List<BasisVersionRow> rows = versions.findRows(dossierId);
        BasisVersionRow current = rows.isEmpty() ? null : rows.get(0);
        if (current == null
                || current.sha256Hash() == null
                || current.sha256Hash().isBlank()) {
            throw new BusinessException(
                    ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        String currentAllocationHash = allocationHash(dossierId, current.versionNo());
        String previousStatus = dossier.getReviewStatus();

        dossier.recordReviewSnapshot(
                current.versionNo(),
                current.sha256Hash(),
                dossier.getDisputeStatus(),
                currentAllocationHash,
                reviewerUserId
        );
        dossiers.save(dossier);

        LegalBasisDossierVersion version = versions
                .findByLegalBasisDossierIdAndVersionNo(dossierId, current.versionNo())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

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
                reviewerUserId
        ));

        auditService.record(new AuditEvent(
                AuditAction.LEGAL_BASIS_REVIEW_RECORDED,
                AuditActorType.USER,
                reviewerUserId,
                null,
                ENTITY_TYPE,
                dossierId,
                previousStatus,
                LegalBasisReviewStatus.FRESH.name(),
                null,
                Map.of(
                        "versionNo", current.versionNo(),
                        "reasonCode", "REVIEW_COMPLETED"
                ),
                STEP_ID,
                RULE_ID
        ));

        return new LegalBasisReviewResponse(
                dossierId,
                LegalBasisReviewStatus.FRESH.name(),
                false,
                "REVIEW_COMPLETED",
                reason,
                current.versionNo(),
                current.sha256Hash(),
                dossier.getDisputeStatus(),
                currentAllocationHash,
                LocalDateTime.now(ZoneOffset.UTC)
        );
    }

    private LegalBasisReviewResponse markRequired(
            LegalBasisDossier dossier,
            BasisVersionRow current,
            String allocationHash,
            String reasonCode,
            String reason
    ) {
        String previousStatus = dossier.getReviewStatus();
        String previousReason = dossier.getReviewRequiredReason();

        dossier.requireReview(reasonCode);
        dossiers.save(dossier);

        if (!LegalBasisReviewStatus.REVIEW_REQUIRED.name().equals(previousStatus)
                || !Objects.equals(previousReason, reasonCode)) {
            Long versionId = null;
            if (current != null) {
                versionId = versions.findByLegalBasisDossierIdAndVersionNo(
                                dossier.getLegalBasisDossierId(), current.versionNo())
                        .map(LegalBasisDossierVersion::getDossierVersionId)
                        .orElse(null);
            }

            history.save(new LegalBasisReviewHistory(
                    dossier.getLegalBasisDossierId(),
                    versionId,
                    current == null ? null : current.versionNo(),
                    current == null ? null : current.sha256Hash(),
                    dossier.getDisputeStatus(),
                    allocationHash,
                    LegalBasisReviewStatus.REVIEW_REQUIRED.name(),
                    reasonCode,
                    reason,
                    null
            ));

            auditService.record(new AuditEvent(
                    AuditAction.LEGAL_BASIS_REVIEW_REQUIRED,
                    AuditActorType.SYSTEM,
                    null,
                    null,
                    ENTITY_TYPE,
                    dossier.getLegalBasisDossierId(),
                    previousStatus,
                    LegalBasisReviewStatus.REVIEW_REQUIRED.name(),
                    null,
                    Map.of("reasonCode", reasonCode),
                    STEP_ID,
                    RULE_ID
            ));
        }

        return new LegalBasisReviewResponse(
                dossier.getLegalBasisDossierId(),
                dossier.getReviewStatus(),
                true,
                reasonCode,
                reason,
                current == null ? null : current.versionNo(),
                current == null ? null : current.sha256Hash(),
                dossier.getDisputeStatus(),
                allocationHash,
                LocalDateTime.now(ZoneOffset.UTC)
        );
    }


    /**
     * ST-20 / PS-37:
     * Ghi nhận hoàn thành review bằng public ID của verification case.
     *
     * Package: com.legacyvault.verification.service
     * Vị trí: trong class LegalBasisReviewService, đặt sau recordCompletedReview().
     */
    @Transactional
    public LegalBasisReviewResponse recordCompletedReviewByCasePublicId(
            UUID casePublicId,
            Long reviewerUserId,
            String reason) {

        if (casePublicId == null
                || reviewerUserId == null
                || reason == null
                || reason.isBlank()
                || reason.length() > 1000) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        VerificationCase verificationCase = verificationCases
                .findByPublicId(casePublicId)
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        LegalBasisDossier dossier = dossiers
                .findByVerificationCaseIdForUpdate(
                        verificationCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        Vault vault = vaultRepository
                .findByIdForUpdate(verificationCase.getVaultId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        if (!Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(vault.getStatus())
                || !LegalBasisDossier.STATUS_FORWARDED.equals(dossier.getStatus())) {
            throw new BusinessException(
                    ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        return recordCompletedReview(
                dossier.getLegalBasisDossierId(),
                reviewerUserId,
                reason.trim());
    }


    public static String allocationHashFromCanonicalValues(List<String> values) {
        return sha256Static(
                values.stream().sorted().collect(Collectors.joining("\n"))
        );
    }

    private String allocationHash(Long dossierId, int versionNo) {
        List<String> scope = allocations.findRowsByDossier(dossierId).stream()
                .filter(row -> row.versionNo() == versionNo)
                .map(this::allocationCanonicalValue)
                .toList();

        return allocationHashFromCanonicalValues(scope);
    }

    private static String sha256Static(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available.", ex);
        }
    }

    private String allocationCanonicalValue(AllocationRow row) {
        return String.valueOf(row.assetId()) + "|"
                + String.valueOf(row.beneficiaryId()) + "|"
                + String.valueOf(row.description());
    }

}
