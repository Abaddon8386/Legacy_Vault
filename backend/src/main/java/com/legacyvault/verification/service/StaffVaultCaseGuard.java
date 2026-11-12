package com.legacyvault.verification.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.vault.repository.VaultRepository;
import com.legacyvault.verification.repository.StaffCaseLockRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * PS-44/45: kiểm tra quyền của Staff trên Vault qua case đang mở được giao cho họ. Luôn tham gia transaction của service
 * gọi ({@code Propagation.MANDATORY}).
 *
 * <p>Được các service phía Staff gọi trước khi thao tác trên Vault, ví dụ {@code CounterBeneficiaryService},
 * {@code IdentityVerificationService}, {@code StaffAssetCatalogService}, {@code CaseContactService},
 * {@code TrusteeContactService}. Dùng bảng {@code vaults} và {@code verification_cases}.
 */
@Service
@Transactional(propagation = Propagation.MANDATORY)
public class StaffVaultCaseGuard {
    private final VaultRepository vaults;
    private final StaffCaseLockRepository cases;

    /**
     * @param vaults repository Vault (có khóa ghi)
     * @param cases truy vấn case mở theo Staff và Vault (có khóa ghi)
     */
    public StaffVaultCaseGuard(VaultRepository vaults, StaffCaseLockRepository cases) {
        this.vaults = vaults;
        this.cases = cases;
    }

    /**
     * Yêu cầu Staff có case đang mở trên Vault cho thao tác ghi: khóa Vault trước rồi khóa case (cùng thứ tự Vault -> DMS
     * -> Case của Cancel Alert, không cần khóa DMS), kể cả trước khi ghi lịch sử/audit có khóa ngoại.
     *
     * @param vaultId id nội bộ của Vault
     * @param staffUserId id người dùng Staff
     * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu không có Vault hoặc case mở của Staff trên Vault đó
     */
    public void requireOpenForWrite(Long vaultId, Long staffUserId) {
        // Match Cancel Alert's Vault -> DMS -> Case order (we do not need a DMS lock).
        // Lock Vault before Case, including before history/audit FK writes.
        vaults.findByIdForUpdate(vaultId).orElseThrow(StaffVaultCaseGuard::notFound);
        cases.findOpenOwnedByStaffForVaultForUpdate(vaultId, staffUserId)
                .orElseThrow(StaffVaultCaseGuard::notFound);
    }

    /**
     * Yêu cầu Staff có case đang mở trên Vault cho thao tác đọc (không khóa).
     *
     * @param vaultId id nội bộ của Vault
     * @param staffUserId id người dùng Staff
     * @throws BusinessException {@code RESOURCE_NOT_FOUND}
     */
    public void requireOpenForRead(Long vaultId, Long staffUserId) {
        cases.findOpenOwnedByStaffForVault(vaultId, staffUserId)
                .orElseThrow(StaffVaultCaseGuard::notFound);
    }

    /**
     * Tạo lỗi {@code RESOURCE_NOT_FOUND} dùng chung.
     */
    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
    }
}
