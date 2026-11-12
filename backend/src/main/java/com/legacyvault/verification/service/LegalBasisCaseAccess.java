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

/**
 * Thứ tự khóa dùng chung cho các quyết định và việc tạm dừng (hold) của Legal: Vault, rồi case, rồi dossier; sau đó
 * làm mới trạng thái đã cache để đọc dữ liệu mới nhất.
 *
 * <p>Được {@link LegalApprovalService}, {@link LegalBasisHoldService}, {@link LegalBasisReviewService} và các service
 * Legal khác dùng cho các API dưới {@code /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/...}
 * (vai trò LEGAL_VERIFIER). Làm việc trên các bảng {@code vaults}, {@code verification_cases} và
 * {@code legal_basis_dossiers} bằng truy vấn khóa ghi; luôn yêu cầu transaction đã có.
 */
@Component
public class LegalBasisCaseAccess {
    private final LegalCaseLookupRepository lookup;
    private final VaultRepository vaults;
    private final VerificationCaseRepository cases;
    private final LegalBasisDossierRepository dossiers;
    private final LegalBasisLockedState state;

    /**
     * @param lookup tra cứu case theo public id (phạm vi Legal toàn cục)
     * @param vaults repository Vault
     * @param cases repository hồ sơ xác minh (có khóa ghi)
     * @param dossiers repository hồ sơ căn cứ pháp lý (có khóa ghi)
     * @param state tiện ích làm mới entity sau khi khóa
     */
    public LegalBasisCaseAccess(LegalCaseLookupRepository lookup, VaultRepository vaults,
            VerificationCaseRepository cases, LegalBasisDossierRepository dossiers, LegalBasisLockedState state) {
        this.lookup = lookup;
        this.vaults = vaults;
        this.cases = cases;
        this.dossiers = dossiers;
        this.state = state;
    }

    /**
     * Khóa đủ ba tầng và bắt buộc phải có dossier.
     *
     * @param publicCaseId public id của hồ sơ xác minh
     * @return {@link LockedCase} gồm Vault, case và dossier đã khóa
     * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu case, Vault hoặc dossier không tồn tại
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public LockedCase lock(UUID publicCaseId) {
        var context = lockContext(publicCaseId);
        if (context.dossier() == null) throw missing();
        return new LockedCase(context.vault(), context.verificationCase(), context.dossier());
    }

    /**
     * Cùng thứ tự ủy quyền và khóa như {@link #lock(UUID)}, nhưng dùng được cả khi dossier chưa được phân loại
     * (khi đó {@code dossier} trong kết quả là {@code null}).
     *
     * @param publicCaseId public id của hồ sơ xác minh
     * @return {@link LockedContext} gồm Vault, case và dossier (có thể null)
     * @throws BusinessException {@code RESOURCE_NOT_FOUND} nếu thiếu case/Vault hoặc case lệch Vault
     */
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

    /**
     * Ngữ cảnh đã khóa, dossier có thể chưa tồn tại.
     *
     * @param vault Vault đã khóa
     * @param verificationCase hồ sơ xác minh đã khóa
     * @param dossier hồ sơ căn cứ đã khóa hoặc {@code null}
     */
    public record LockedContext(Vault vault, VerificationCase verificationCase, LegalBasisDossier dossier) { }

    /**
     * Tạo lỗi {@code RESOURCE_NOT_FOUND} dùng chung.
     */
    private static BusinessException missing() { return new BusinessException(ErrorCode.RESOURCE_NOT_FOUND); }

    /**
     * Ngữ cảnh đã khóa với dossier chắc chắn tồn tại.
     *
     * @param vault Vault đã khóa
     * @param verificationCase hồ sơ xác minh đã khóa
     * @param dossier hồ sơ căn cứ đã khóa
     */
    public record LockedCase(Vault vault, VerificationCase verificationCase, LegalBasisDossier dossier) {
        /**
         * Yêu cầu case còn mở.
         *
         * @throws BusinessException {@code BASIS_DOSSIER_INVALID_STATE} nếu case đã đóng
         */
        public void requireOpen() {
            if (!verificationCase.isOpen()) throw new BusinessException(ErrorCode.BASIS_DOSSIER_INVALID_STATE);
        }
    }
}
