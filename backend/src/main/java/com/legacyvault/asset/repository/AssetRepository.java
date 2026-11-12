package com.legacyvault.asset.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.legacyvault.asset.entity.Asset;
import com.legacyvault.asset.entity.AssetType;

/**
 * Truy vấn Asset luôn kèm {@code vaultId} của một Vault đã qua kiểm tra ownership
 * ({@code VaultService.requireOwnedVault}); không tra Asset chỉ theo publicId.
 */
public interface AssetRepository extends JpaRepository<Asset, Long> {

	/**
	 * Danh sách Asset của Vault, bỏ loại DOCUMENT (di chúc đi qua /wills). Dùng bởi {@code AssetService.listAssets}.
	 *
	 * @param vaultId id nội bộ của Vault
	 * @param excludedType loại bị loại trừ (DOCUMENT)
	 * @param pageable phân trang + sắp xếp
	 */
	Page<Asset> findByVaultIdAndAssetTypeNot(Long vaultId, AssetType excludedType, Pageable pageable);

	/**
	 * Danh mục metadata công khai của Asset cho một hồ sơ Staff đã được ủy quyền trước khi mở khóa (lọc thêm theo {@code status}).
	 *
	 * @param status trạng thái Asset cần lấy
	 */
	Page<Asset> findByVaultIdAndStatusAndAssetTypeNot(Long vaultId, String status, AssetType excludedType, Pageable pageable);

	/**
	 * Một Asset của đúng Vault đó (bỏ DOCUMENT): Asset của Vault khác hay di chúc đều coi như không tồn tại. Dùng bởi {@code AssetService}, {@code AssetDocumentService}, {@code AssetImageService}.
	 */
	Optional<Asset> findByPublicIdAndVaultIdAndAssetTypeNot(UUID publicId, Long vaultId, AssetType excludedType);
}
