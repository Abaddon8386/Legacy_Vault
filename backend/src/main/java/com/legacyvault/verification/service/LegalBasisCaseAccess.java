package com.legacyvault.verification.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.entity.LegalBasisDossier;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.util.Objects;
import java.util.UUID;

/** Shared lock order for decisions and hold: Vault -> case -> dossier, then refresh cached state. */
@Component
public class LegalBasisCaseAccess {
    private final LegalCaseLookupRepository lookup;
    private final VaultRepository vaults;
    private final VerificationCaseRepository cases;
    private final LegalBasisDossierRepository dossiers;
    private final LegalBasisLockedState state;

    public LegalBasisCaseAccess(LegalCaseLookupRepository lookup, VaultRepository vaults,
            VerificationCaseRepository cases, LegalBasisDossierRepository dossiers, LegalBasisLockedState state) {
        this.lookup = lookup;
        this.vaults = vaults;
        this.cases = cases;
        this.dossiers = dossiers;
        this.state = state;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public LockedCase lock(UUID publicCaseId) {
        var context = lockContext(publicCaseId);
        if (context.dossier() == null) throw missing();
        return new LockedCase(context.vault(), context.verificationCase(), context.dossier());
    }

    /** Same authorization/lock order, also usable before a dossier has been classified. */
    @Transactional(propagation = Propagation.MANDATORY)
    public LockedContext lockContext(UUID publicCaseId) {
        VerificationCase initial = lookup.findByPublicId(publicCaseId).orElseThrow(LegalBasisCaseAccess::missing);
        Vault vault = vaults.findByIdForUpdate(initial.getVaultId()).orElseThrow(LegalBasisCaseAccess::missing);
        state.refresh(vault);
        VerificationCase verificationCase = cases.findByIdForUpdate(initial.getVerificationCaseId()).orElseThrow(LegalBasisCaseAccess::missing);
        state.refresh(verificationCase);
        if (!Objects.equals(vault.getVaultId(), verificationCase.getVaultId())) throw missing();
        LegalBasisDossier dossier = dossiers.findByVerificationCaseIdForUpdate(verificationCase.getVerificationCaseId()).orElse(null);
        if (dossier != null) state.refresh(dossier);
        return new LockedContext(vault, verificationCase, dossier);
    }

    private WillComparisonService comparisons;
    @org.springframework.beans.factory.annotation.Autowired
    public void setComparisons(WillComparisonService comparisons) { this.comparisons = comparisons; }
    public void requireComparedWill(VerificationCase verificationCase) {
        if (comparisons == null) throw new IllegalStateException("Will comparison gate is unavailable");
        if (comparisons.isApprovalBlocked(verificationCase.getVerificationCaseId()))
            throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
    }
    public record LockedContext(Vault vault, VerificationCase verificationCase, LegalBasisDossier dossier) { }

    private static BusinessException missing() { return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND); }

    public record LockedCase(Vault vault, VerificationCase verificationCase, LegalBasisDossier dossier) {
        public void requireOpen() {
            if (!verificationCase.isOpen()) throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }
    }
}
