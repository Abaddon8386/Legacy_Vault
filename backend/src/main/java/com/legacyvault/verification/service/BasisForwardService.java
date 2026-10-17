
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

    public BasisForwardService(
            StaffCaseLockRepository staffCases,
            VerificationCaseRepository caseRepository,
            VaultRepository vaultRepository,
            LegalBasisDossierRepository dossiers,
            LegalBasisDossierVersionRepository versions,
            BasisDossierViewService views,
            AuditService auditService) {
        this.staffCases = staffCases;
        this.caseRepository = caseRepository;
        this.vaultRepository = vaultRepository;
        this.dossiers = dossiers;
        this.versions = versions;
        this.views = views;
        this.auditService = auditService;
    }

    @Transactional
    public BasisDossierResponse forward(
            UUID caseId,
            int versionNo,
            CustomUserPrincipal principal) {

        Long staffUserId = CustomUserPrincipal.requireUserId(principal);

        VerificationCase initialCase = staffCases
                .findOwnedByStaff(caseId, staffUserId)
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        // Giữ thứ tự khóa: Vault -> VerificationCase -> Dossier.
        Vault vault = vaultRepository
                .findByIdForUpdate(initialCase.getVaultId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        VerificationCase verificationCase = caseRepository
                .findByIdForUpdate(initialCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        if (!Objects.equals(
                verificationCase.getAssignedStaffUserId(), staffUserId)
                || !Objects.equals(
                verificationCase.getVaultId(), vault.getVaultId())) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }

        if (!verificationCase.isOpen()
                || !Vault.STATUS_AWAITING_LEGAL_BASIS.equals(
                vault.getStatus())) {
            throw new BusinessException(
                    ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        LegalBasisDossier dossier = dossiers
                .findByVerificationCaseIdForUpdate(
                        verificationCase.getVerificationCaseId())
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));

        if (!LegalBasisDossier.STATUS_PROVIDED.equals(dossier.getStatus())) {
            throw new BusinessException(
                    ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        int latestVersionNo =
                versions.findMaxVersionNo(dossier.getLegalBasisDossierId());

        if (versionNo < 1 || versionNo > latestVersionNo) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        }

        if (versionNo != latestVersionNo) {
            throw new BusinessException(ErrorCode.BASIS_VERSION_STALE);
        }

        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);

        if (versions.markForwarded(
                dossier.getLegalBasisDossierId(),
                versionNo,
                staffUserId,
                now) != 1) {
            throw new BusinessException(
                    ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }

        String vaultStatusBefore = vault.getStatus();

        dossier.markForwarded();
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
                        "verificationCaseId",
                        verificationCase.getPublicId().toString(),
                        "version", versionNo,
                        "route", dossier.getRoute()
                ),
                STEP_ID,
                RULE_ID
        ));

        return views.view(verificationCase, false);
    }
}
