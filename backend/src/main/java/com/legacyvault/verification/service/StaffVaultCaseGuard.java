package com.legacyvault.verification.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** PS-44/45 authorization; always participates in the calling service's transaction. */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class StaffVaultCaseGuard {
    private final VaultRepository vaults;
    private final StaffCaseLockRepository cases;

    public StaffVaultCaseGuard(VaultRepository vaults, StaffCaseLockRepository cases) {
        this.vaults = vaults;
        this.cases = cases;
    }

    public void requireOpenForWrite(Long vaultId, Long staffUserId) {
        // Match Cancel Alert's Vault -> DMS -> Case order (we do not need a DMS lock).
        // Lock Vault before Case, including before history/audit FK writes.
        vaults.findByIdForUpdate(vaultId).orElseThrow(StaffVaultCaseGuard::notFound);
        cases.findOpenOwnedByStaffForVaultForUpdate(vaultId, staffUserId)
                .orElseThrow(StaffVaultCaseGuard::notFound);
    }

    public void requireOpenForRead(Long vaultId, Long staffUserId) {
        cases.findOpenOwnedByStaffForVault(vaultId, staffUserId)
                .orElseThrow(StaffVaultCaseGuard::notFound);
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
    }
}
