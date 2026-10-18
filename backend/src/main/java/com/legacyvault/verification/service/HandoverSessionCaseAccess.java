package com.legacyvault.verification.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.Objects;
import java.util.UUID;

/** Locks the authoritative Vault then its assigned Staff case for handover writes. */
@Component
public class HandoverSessionCaseAccess {
    private final VerificationCaseRepository cases;
    private final VaultRepository vaults;
    private final StaffCaseLockRepository staffCases;
    private final LegalBasisLockedState state;

    public HandoverSessionCaseAccess(VerificationCaseRepository cases, VaultRepository vaults,
            StaffCaseLockRepository staffCases, LegalBasisLockedState state) {
        this.cases = cases;
        this.vaults = vaults;
        this.staffCases = staffCases;
        this.state = state;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public LockedCase lockByPublicCaseId(UUID casePublicId, Long staffUserId) {
        VerificationCase initial = cases.findByPublicId(casePublicId).orElseThrow(HandoverSessionCaseAccess::notFound);
        return lock(initial.getVerificationCaseId(), staffUserId);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public LockedCase lock(Long verificationCaseId, Long staffUserId) {
        VerificationCase initial = cases.findById(verificationCaseId).orElseThrow(HandoverSessionCaseAccess::notFound);
        Vault vault = vaults.findByIdForUpdate(initial.getVaultId()).orElseThrow(HandoverSessionCaseAccess::notFound);
        state.refresh(vault);
        VerificationCase verificationCase = staffCases
                .findOwnedByStaffForUpdate(initial.getPublicId(), staffUserId)
                .orElseThrow(HandoverSessionCaseAccess::notFound);
        state.refresh(verificationCase);
        if (!Objects.equals(vault.getVaultId(), verificationCase.getVaultId())) throw notFound();
        return new LockedCase(vault, verificationCase);
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
    }

    public record LockedCase(Vault vault, VerificationCase verificationCase) {}
}
