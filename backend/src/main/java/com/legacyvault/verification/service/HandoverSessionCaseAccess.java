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

/**
 * Khóa Vault có thẩm quyền rồi đến hồ sơ (case) Staff được giao để thực hiện các thao tác ghi của phiên bàn giao.
 *
 * <p>Thứ tự khóa luôn là Vault trước, case sau (cùng thứ tự với các luồng ghi khác) để tránh deadlock. Được
 * {@link HandoverSessionService} và các service bàn giao dùng cho các API dưới
 * {@code /api/v1/staff/verification-cases/{caseId}/handover-sessions}. Làm việc trên bảng {@code vaults} và
 * {@code verification_cases} bằng truy vấn khóa ghi (FOR UPDATE).
 */
@Component
public class HandoverSessionCaseAccess {
    private final VerificationCaseRepository cases;
    private final VaultRepository vaults;
    private final StaffCaseLockRepository staffCases;
    private final LegalBasisLockedState state;

    /**
     * @param cases repository hồ sơ xác minh
     * @param vaults repository Vault (có truy vấn khóa ghi {@code findByIdForUpdate})
     * @param staffCases repository khóa case theo Staff được giao
     * @param state tiện ích làm mới entity sau khi khóa để đọc trạng thái mới nhất
     */
    public HandoverSessionCaseAccess(VerificationCaseRepository cases, VaultRepository vaults,
            StaffCaseLockRepository staffCases, LegalBasisLockedState state) {
        this.cases = cases;
        this.vaults = vaults;
        this.staffCases = staffCases;
        this.state = state;
    }

    /**
     * Khóa theo public id của case: tra id nội bộ rồi chuyển sang {@link #lock(Long, Long)}.
     *
     * @param casePublicId public id của hồ sơ xác minh (path {@code caseId})
     * @param staffUserId id người dùng Staff đang thao tác
     * @return cặp Vault và case đã khóa
     * @throws BusinessException với {@code RESOURCE_NOT_FOUND} nếu case không tồn tại hoặc không thuộc Staff
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public LockedCase lockByPublicCaseId(UUID casePublicId, Long staffUserId) {
        VerificationCase initial = cases.findByPublicId(casePublicId).orElseThrow(HandoverSessionCaseAccess::notFound);
        return lock(initial.getVerificationCaseId(), staffUserId);
    }

    /**
     * Khóa Vault rồi khóa case do Staff phụ trách, làm mới cả hai entity và kiểm tra chúng thuộc cùng một Vault.
     *
     * @param verificationCaseId id nội bộ của hồ sơ xác minh
     * @param staffUserId id người dùng Staff phải là người được giao case
     * @return {@link LockedCase} gồm Vault và case đã khóa
     * @throws BusinessException với {@code RESOURCE_NOT_FOUND} nếu thiếu case/Vault, case không thuộc Staff hoặc lệch Vault
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

    /**
     * Tạo lỗi {@code RESOURCE_NOT_FOUND} dùng chung, che giấu việc tài nguyên có tồn tại hay không.
     */
    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
    }

    /**
     * Kết quả khóa: Vault và hồ sơ xác minh đã được khóa ghi trong transaction hiện tại.
     *
     * @param vault Vault có thẩm quyền
     * @param verificationCase hồ sơ xác minh của Staff
     */
    public record LockedCase(Vault vault, VerificationCase verificationCase) {}
}
