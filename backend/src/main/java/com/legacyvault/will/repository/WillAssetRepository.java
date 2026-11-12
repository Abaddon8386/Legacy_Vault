package com.legacyvault.will.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import com.legacyvault.asset.entity.Asset;

import jakarta.persistence.LockModeType;

/**
 * "Hồ sơ di chúc" = Asset loại DOCUMENT có legal_documents.document_type = 'WILL' (B3, wills.md), dùng bởi {@code WillService}.
 * Mọi truy vấn kèm {@code vaultId} của Vault đã qua kiểm tra ownership.
 */
public interface WillAssetRepository extends Repository<Asset, Long> {

	/**
	 * Điều kiện JPQL dùng chung: thuộc Vault, là Asset DOCUMENT và có {@code LegalDocument} loại WILL.
	 */
	String WILL_FILTER = """
			a.vaultId = :vaultId and a.assetType = com.legacyvault.asset.entity.AssetType.DOCUMENT
			and exists (select 1 from LegalDocument d where d.assetId = a.assetId and d.documentType = 'WILL')""";

	/**
	 * Lưu Asset di chúc mới.
	 */
	Asset save(Asset asset);

	/**
	 * Phân trang các di chúc của Vault.
	 */
	@Query("select a from Asset a where " + WILL_FILTER)
	Page<Asset> findWills(@Param("vaultId") Long vaultId, Pageable pageable);

	/**
	 * Tìm một di chúc theo public id trong đúng Vault.
	 */
	@Query("select a from Asset a where a.publicId = :willId and " + WILL_FILTER)
	Optional<Asset> findWill(@Param("willId") UUID willId, @Param("vaultId") Long vaultId);

	/**
	 * Như {@link #findWill} nhưng khóa dòng Asset tới hết giao dịch: hai lần tải phiên bản mới cùng lúc sẽ chạy lần
	 * lượt, nên không cấp trùng {@code version_no}.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select a from Asset a where a.publicId = :willId and " + WILL_FILTER)
	Optional<Asset> findWillForUpdate(@Param("willId") UUID willId, @Param("vaultId") Long vaultId);
}
