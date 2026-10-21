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

	/** Danh sách Asset của Vault, bỏ loại DOCUMENT (di chúc đi qua /wills). */
	Page<Asset> findByVaultIdAndAssetTypeNot(Long vaultId, AssetType excludedType, Pageable pageable);

	/** Public metadata catalog for an authorized pre-unlock Staff case. */
	Page<Asset> findByVaultIdAndStatusAndAssetTypeNot(Long vaultId, String status, AssetType excludedType, Pageable pageable);

	/** Một Asset của đúng Vault đó (bỏ DOCUMENT): Asset của Vault khác hay di chúc đều coi như không tồn tại. */
	Optional<Asset> findByPublicIdAndVaultIdAndAssetTypeNot(UUID publicId, Long vaultId, AssetType excludedType);
}
