package com.legacyvault.verification.service;

import com.legacyvault.beneficiary.Beneficiary;
import com.legacyvault.beneficiary.BeneficiaryRepository;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.CustomUserPrincipal;
import com.legacyvault.trustee.TrusteeRepository;
import com.legacyvault.user.entity.User;
import com.legacyvault.user.repository.UserRepository;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.dto.StaffCaseWorkContextResponse;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.*;
import com.legacyvault.asset.repository.AssetRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/** Read-only PS-93 aggregate. Access mirrors the existing Staff case detail/claim queue. */
@Service
public class StaffCaseWorkContextService {
    private final VerificationCaseRepository cases;
    private final VaultRepository vaults;
    private final UserRepository users;
    private final TrusteeRepository trustees;
    private final BeneficiaryRepository beneficiaries;
    private final LegalBasisDossierRepository dossiers;
    private final LegalBasisDossierVersionRepository versions;
    private final LegalBasisVersionAllocationRepository allocations;
    private final CourtDecisionRepository courtDecisions;
    private final AssetRepository assets;
    private final LegalApprovalGuard approvalGuard;

    public StaffCaseWorkContextService(VerificationCaseRepository cases, VaultRepository vaults, UserRepository users,
            TrusteeRepository trustees, BeneficiaryRepository beneficiaries, LegalBasisDossierRepository dossiers,
            LegalBasisDossierVersionRepository versions, LegalBasisVersionAllocationRepository allocations,
            CourtDecisionRepository courtDecisions, AssetRepository assets, LegalApprovalGuard approvalGuard) {
        this.cases = cases; this.vaults = vaults; this.users = users; this.trustees = trustees;
        this.beneficiaries = beneficiaries; this.dossiers = dossiers; this.versions = versions;
        this.allocations = allocations; this.courtDecisions = courtDecisions;
        this.assets = assets; this.approvalGuard = approvalGuard;
    }

    @Transactional(readOnly = true)
    public StaffCaseWorkContextResponse get(UUID caseId, CustomUserPrincipal principal) {
        Long actor = CustomUserPrincipal.requireUserId(principal);
        VerificationCase verificationCase = cases.findViewableCaseByPublicId(caseId, actor)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        Vault vault = vaults.findById(verificationCase.getVaultId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        UUID assignedPublicId = verificationCase.getAssignedStaffUserId() == null ? null
                : users.findById(verificationCase.getAssignedStaffUserId()).map(User::getPublicId).orElse(null);
        boolean unassigned = verificationCase.getAssignedStaffUserId() == null;

        List<StaffCaseWorkContextResponse.TrusteeContact> trusteeRows = trustees
                .findFirstByVault_VaultIdAndStatus(vault.getVaultId(), "APPOINTED")
                .map(t -> List.of(new StaffCaseWorkContextResponse.TrusteeContact(t.getPublicId(), t.getFullName(),
                        t.getPhone(), t.getEmail(), t.getStatus())))
                .orElseGet(List::of);
        var beneficiaryPage = beneficiaries.findAllByVault_VaultId(vault.getVaultId(), PageRequest.of(0, 200));
        List<Beneficiary> people = new ArrayList<>(beneficiaryPage.getContent());
        for (int page = 1; beneficiaryPage.hasNext(); page++) {
            beneficiaryPage = beneficiaries.findAllByVault_VaultId(vault.getVaultId(), PageRequest.of(page, 200));
            people.addAll(beneficiaryPage.getContent());
        }
        Map<UUID, List<StaffCaseWorkContextResponse.AssetItem>> byBeneficiary = new HashMap<>();
        List<String> conditions = new ArrayList<>();
        List<String> references = new ArrayList<>(List.of(
                "/api/v1/staff/verification-cases/" + caseId + "/death-documents",
                "/api/v1/staff/verification-cases/" + caseId + "/original-will-intakes",
                "/api/v1/staff/verification-cases/" + caseId + "/basis-dossier"));
        trusteeRows.forEach(t -> references.add("/api/v1/staff/trustees/" + t.id() + "/contact-outcomes"));
        boolean hold = Vault.STATUS_ON_HOLD.equals(vault.getStatus());
        String route = null, dossierStatus = null, reviewStatus = null;
        LegalBasisDossier dossier = dossiers.findByVerificationCaseId(verificationCase.getVerificationCaseId()).orElse(null);
        if (dossier != null) {
            route = dossier.getRoute(); dossierStatus = dossier.getStatus(); reviewStatus = dossier.getReviewStatus();
            hold |= LegalBasisDossier.ROUTE_ON_HOLD.equals(route);
            int latest = versions.findMaxVersionNo(dossier.getLegalBasisDossierId());
            if (!LegalBasisDossier.ROUTE_COURT.equals(route)) conditions.add("COURT_BASIS_REQUIRED");
            if (latest < dossier.getRequiredVersionNo()) conditions.add("CURRENT_REQUIRED_BASIS_VERSION_MISSING");
            else {
                var current = versions.findCourtEvidence(dossier.getLegalBasisDossierId(), latest).orElse(null);
                if (current == null || !current.isReviewable()) conditions.add("COURT_DOCUMENT_NOT_REVIEWABLE");
                else if (courtDecisions.findFirstByDossierVersionIdOrderByIdDesc(current.id())
                        .filter(d -> "VALID".equals(d.getResult())).isEmpty()) conditions.add("COURT_DECISION_NOT_VALID");
                var currentRows = allocations.findRowsByDossier(dossier.getLegalBasisDossierId()).stream()
                        .filter(row -> row.versionNo() == latest).toList();
                currentRows.forEach(row -> {
                    var asset = assets.findByPublicIdAndVaultIdAndAssetTypeNot(row.assetId(), vault.getVaultId(),
                            com.legacyvault.asset.entity.AssetType.DOCUMENT);
                    byBeneficiary.computeIfAbsent(row.beneficiaryId(), ignored -> new ArrayList<>())
                            .add(new StaffCaseWorkContextResponse.AssetItem(row.assetId(),
                                    asset.map(a -> a.getName()).orElse(null), row.description()));
                });
                try {
                    approvalGuard.requireCurrentApproval(dossier, current);
                } catch (BusinessException ex) {
                    conditions.add("LEGAL_REVIEW_STALE_OR_REQUIRED");
                }
            }
            if (!LegalBasisDossier.STATUS_FORWARDED.equals(dossierStatus)) conditions.add("DOSSIER_NOT_FORWARDED");
        } else conditions.add("LEGAL_BASIS_DOSSIER_MISSING");
        if (hold) conditions.add("LEGAL_WORKFLOW_ON_HOLD");
        if (trusteeRows.isEmpty()) conditions.add("TRUSTEE_NOT_APPOINTED_CONTACT_FALLBACK_POLICY_UNDECIDED");
        if (unassigned) conditions.add("CASE_NOT_CLAIMED");

        List<StaffCaseWorkContextResponse.BeneficiaryItem> beneficiaryRows = people.stream()
                .map(b -> new StaffCaseWorkContextResponse.BeneficiaryItem(b.getPublicId(), b.getFullName(),
                        b.getRelationship(), byBeneficiary.getOrDefault(b.getPublicId(), List.of())))
                .toList();
        people.forEach(b -> references.add("/api/v1/staff/beneficiaries/" + b.getPublicId()
                + "/identity-verifications"));
        return new StaffCaseWorkContextResponse(caseId, verificationCase.getCaseNumber(), verificationCase.getStatus(),
                unassigned ? "UNASSIGNED_CLAIMABLE" : "ASSIGNED", assignedPublicId, vault.getPublicId(),
                vault.getStatus(), workflowStep(vault.getStatus()), route, dossierStatus, reviewStatus, hold,
                trusteeRows, beneficiaryRows, references, conditions);
    }

    /** Current Vault state is authoritative; Main Flow file is absent, so no ST number is inferred here. */
    private static String workflowStep(String status) { return status; }
}
