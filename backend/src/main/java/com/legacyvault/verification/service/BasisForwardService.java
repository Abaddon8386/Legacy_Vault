package com.legacyvault.verification.service;

import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;
import com.legacyvault.audit.AuditService;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.BasisDossierResponse;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.LegalBasisReviewStatus;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.LegalBasisDossierRepository;
import com.legacyvault.verification.repository.LegalBasisDossierVersionRepository;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * PS-42 (ST-19, LV-BASIS-001): Staff chuyển đúng phiên bản văn bản căn cứ cho Legal. Chỉ phiên bản MỚI NHẤT được chuyển; phiên
 * bản cũ bị từ chối (BASIS_VERSION_STALE) nhưng vẫn được giữ làm chứng cứ. Chuyển xong hồ sơ là LEGAL_BASIS_FORWARDED và Vault
 * sang LEGAL_BASIS_VERIFICATION (Main Flow ST-20). Chưa phải duyệt: Legal thẩm định ở bước sau.
 *
 * <p>Thứ tự khóa Vault -> ca -> hồ sơ, cùng thứ tự với các luồng Legal và Cancel Alert (chuyển Vault nên phải khóa Vault trước).
 */
@Service
public class BasisForwardService {

    static final String ENTITY_TYPE = "LEGAL_BASIS_DOSSIER";
    static final String STEP_ID = "ST-19";
    static final String RULE_ID = "LV-BASIS-001";

    private final StaffCaseLockRepository staffCases;
    private final VerificationCaseRepository caseRepository;
    private final VaultRepository vaultRepository;
    private final LegalBasisDossierRepository dossiers;
    private final LegalBasisDossierVersionRepository versions;
    private final BasisDossierViewService views;
    private final AuditService auditService;
    private final LegalBasisReviewService legalBasisReviewService;

    public BasisForwardService(StaffCaseLockRepository staffCases, VerificationCaseRepository caseRepository,
            VaultRepository vaultRepository, LegalBasisDossierRepository dossiers,
            LegalBasisDossierVersionRepository versions, BasisDossierViewService views, AuditService auditService,
                               LegalBasisReviewService legalBasisReviewService) {
        this.staffCases = staffCases;
        this.caseRepository = caseRepository;
        this.vaultRepository = vaultRepository;
        this.dossiers = dossiers;
        this.versions = versions;
        this.views = views;
        this.auditService = auditService;
        this.legalBasisReviewService = legalBasisReviewService;
    }

    @Transactional
    public BasisDossierResponse forward(UUID caseId, int versionNo, CustomUserPrincipal principal) {
        Long staffUserId = CustomUserPrincipal.requireUserId(principal);

        // Đọc không khóa để biết Vault cần khóa trước; sau đó khóa Vault -> ca -> hồ sơ.
        VerificationCase initialCase = staffCases.findOwnedByStaff(caseId, staffUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        Vault vault = vaultRepository.findByIdForUpdate(initialCase.getVaultId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        VerificationCase verificationCase = caseRepository.findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (!Objects.equals(verificationCase.getAssignedStaffUserId(), staffUserId)
                || !Objects.equals(verificationCase.getVaultId(), vault.getVaultId())) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        if (!verificationCase.isOpen() || !Vault.STATUS_AWAITING_LEGAL_BASIS.equals(vault.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        LegalBasisDossier dossier = dossiers.findByVerificationCaseIdForUpdate(verificationCase.getVerificationCaseId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (!LegalBasisDossier.STATUS_PROVIDED.equals(dossier.getStatus())) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        boolean hasPreviousReview = dossier.getLastReviewedVersionNo() != null;

        if (hasPreviousReview) {
            legalBasisReviewService.evaluate(dossier.getLegalBasisDossierId());

            dossier = dossiers.findByVerificationCaseIdForUpdate(
                    verificationCase.getVerificationCaseId()
            ).orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

            if (!LegalBasisReviewStatus.FRESH.name().equals(dossier.getReviewStatus())) {
                throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
            }
        }

        int current = versions.findMaxVersionNo(dossier.getLegalBasisDossierId());
        if (versionNo < 1 || versionNo > current) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }
        if (versionNo != current) {
            throw new BusinessException(ErrorCode.BASIS_VERSION_STALE);
        }

        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (versions.markForwarded(dossier.getLegalBasisDossierId(), versionNo, staffUserId, now) != 1) {
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }
        dossier.markForwarded();
        String vaultStatusBefore = vault.getStatus();
        vault.markLegalBasisVerification();

        auditService.record(new AuditEvent(
                AuditAction.LEGAL_BASIS_FORWARDED,
                AuditActorType.USER,
                staffUserId,
                verificationCase.getVaultId(),
                ENTITY_TYPE,
                dossier.getLegalBasisDossierId(),
                vaultStatusBefore,
                vault.getStatus(),
                null,
                Map.of(
                        "dossierId", dossier.getPublicId().toString(),
                        "verificationCaseId", verificationCase.getPublicId().toString(),
                        "version", versionNo,
                        "route", dossier.getRoute()
                ),
                STEP_ID,
                RULE_ID
        ));

        return views.view(verificationCase, false);
    }
}
