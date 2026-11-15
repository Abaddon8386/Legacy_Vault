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

/** Khóa Vault gốc rồi đến ca Staff được giao để ghi dữ liệu bàn giao. */
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

    /**
     * Khóa Vault và ca theo public UUID của ca. Yêu cầu đã có transaction (Propagation.MANDATORY).
     * @throws BusinessException RESOURCE_NOT_FOUND khi ca không tồn tại hoặc không được giao cho Staff
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public LockedCase lockByPublicCaseId(UUID casePublicId, Long staffUserId) {
        VerificationCase initial = cases.findByPublicId(casePublicId).orElseThrow(HandoverSessionCaseAccess::notFound);
        return lock(initial.getVerificationCaseId(), staffUserId);
    }

    /**
     * Khóa theo thứ tự Vault -> VerificationCase (ca phải thuộc đúng Staff) và xác nhận lại ca vẫn thuộc Vault vừa khóa.
     * Mọi lỗi đều trả RESOURCE_NOT_FOUND để không phân biệt "không tồn tại" với "không có quyền".
     * @return cặp Vault và ca đã khóa và đã refresh
     */
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
