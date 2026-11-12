package com.legacyvault.beneficiary;

import java.util.UUID;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.legacyvault.asset.entity.AssetType;
import com.legacyvault.asset.repository.AssetRepository;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.common.security.StaffContextService;
import com.legacyvault.common.web.PageResponse;
import com.legacyvault.user.entity.User;
import com.legacyvault.verification.entity.VerificationCase;
import com.legacyvault.verification.repository.VerificationCaseRepository;
import com.legacyvault.verification.service.StaffVaultCaseGuard;
import com.legacyvault.vault.entity.Vault;
import com.legacyvault.vault.repository.VaultRepository;

/**
 * Read-only metadata for assigned Staff during legal intake and unlocked handover.
 *
 * <p>Gọi từ {@code StaffAssetCatalogController}. Bảng: {@code verification_cases}, {@code vaults}, {@code assets}.
 */
@Service
public class StaffAssetCatalogService {
	private final VerificationCaseRepository cases;
	private final VaultRepository vaults;
	private final StaffVaultCaseGuard guard;
	private final AssetRepository assets;
	private final StaffContextService staff;

	/**
	 * Hàm khởi tạo, Spring tiêm các phụ thuộc.
	 */
	public StaffAssetCatalogService(VerificationCaseRepository cases, VaultRepository vaults,
			StaffVaultCaseGuard guard, AssetRepository assets, StaffContextService staff) {
		this.cases = cases;
		this.vaults = vaults;
		this.guard = guard;
		this.assets = assets;
		this.staff = staff;
	}

	/**
	 * Liệt kê tài sản ACTIVE (trừ loại DOCUMENT) của Vault. Các bước: xác thực Staff, tìm case được giao, kiểm tra case đang mở (đọc),
	 * tải Vault, chỉ cho phép khi Vault ở trạng thái trước khi mở khóa, đã mở khóa hoặc đang bàn giao, rồi phân trang theo {@code assetId}.
	 * @throws com.legacyvault.common.error.BusinessException {@code RESOURCE_NOT_FOUND} nếu không có quyền hoặc Vault ở trạng thái khác
	 */
	@Transactional(readOnly = true)
	public PageResponse<StaffAssetCatalogDtos.Item> list(UUID caseId, int page, int size) {
		User actor = staff.requireStaff();
		VerificationCase verificationCase = cases.findByPublicIdAndAssignedStaffUserId(caseId, actor.getUserId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		guard.requireOpenForRead(verificationCase.getVaultId(), actor.getUserId());
		Vault vault = vaults.findById(verificationCase.getVaultId())
				.orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
		if (!isPreUnlockStatus(vault.getStatus()) && !Vault.STATUS_UNLOCKED.equals(vault.getStatus())
				&& !Vault.STATUS_HANDOVER_IN_PROGRESS.equals(vault.getStatus())) {
			throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
		}
		var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.ASC, "assetId"));
		var result = assets.findByVaultIdAndStatusAndAssetTypeNot(vault.getVaultId(), "ACTIVE", AssetType.DOCUMENT, pageable)
				.map(StaffAssetCatalogDtos.Item::from);
		return PageResponse.from(result, item -> item);
	}

	/**
	 * @return {@code true} nếu trạng thái Vault thuộc giai đoạn trước khi mở khóa (chờ xác minh, xác minh tài liệu, xác minh di chúc, chờ căn cứ pháp lý, xác minh căn cứ pháp lý).
	 */
	static boolean isPreUnlockStatus(String status) {
		return Vault.STATUS_AWAITING_VERIFICATION.equals(status)
				|| Vault.STATUS_DOCUMENT_VERIFICATION.equals(status)
				|| Vault.STATUS_WILL_VERIFICATION.equals(status)
				|| Vault.STATUS_AWAITING_LEGAL_BASIS.equals(status)
				|| Vault.STATUS_LEGAL_BASIS_VERIFICATION.equals(status);
	}
}
