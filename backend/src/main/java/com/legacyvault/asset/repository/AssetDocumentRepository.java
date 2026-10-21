package com.legacyvault.asset.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.legacyvault.asset.entity.AssetDocument;

public interface AssetDocumentRepository extends JpaRepository<AssetDocument, Long> {

	/** Metadata only: listing must never load the encrypted content. */
	record Row(UUID id, String fileName, String contentType, long sizeBytes, String sha256, Instant createdAt) { }

	long countByAssetId(Long assetId);

	Optional<AssetDocument> findByPublicIdAndAssetId(UUID publicId, Long assetId);

	@Query("""
		select new com.legacyvault.asset.repository.AssetDocumentRepository$Row(d.publicId, d.fileName, d.contentType,
			d.size, d.sha256, d.createdAt)
		from AssetDocument d where d.assetId = :assetId order by d.id asc
		""")
	List<Row> findRowsByAssetId(@Param("assetId") Long assetId);
}
