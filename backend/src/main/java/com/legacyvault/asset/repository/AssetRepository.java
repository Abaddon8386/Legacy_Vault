package com.legacyvault.asset.repository;

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
}
