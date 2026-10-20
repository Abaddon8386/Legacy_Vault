package com.legacyvault.verification.dto;

import java.util.List;
import java.util.UUID;

/** Minimal Staff work context assembled from authoritative case, Vault and Legal dossier records. */
public record StaffCaseWorkContextResponse(
        UUID caseId,
        String caseNumber,
        String caseStatus,
        String assignment,
        UUID assignedStaffId,
        UUID vaultId,
        String vaultStatus,
        String workflowStep,
        String legalRoute,
        String dossierStatus,
        String reviewStatus,
        boolean onHold,
        List<TrusteeContact> trustees,
        List<BeneficiaryItem> beneficiaries,
        List<String> readReferences,
        List<String> unmetConditions
) {
    public StaffCaseWorkContextResponse {
        trustees = List.copyOf(trustees);
        beneficiaries = List.copyOf(beneficiaries);
        readReferences = List.copyOf(readReferences);
        unmetConditions = List.copyOf(unmetConditions);
    }

    public record TrusteeContact(UUID id, String name, String phone, String email, String status) { }
    public record BeneficiaryItem(UUID beneficiaryId, String name, String relationship, List<AssetItem> items) {
        public BeneficiaryItem { items = List.copyOf(items); }
    }
    public record AssetItem(UUID assetId, String title, String allocationDescription) { }
}
