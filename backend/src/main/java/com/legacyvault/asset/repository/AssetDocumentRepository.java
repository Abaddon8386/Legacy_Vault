package com.legacyvault.asset.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.legacyvault.asset.entity.AssetDocument;

/**
 * Repository JPA cho bảng {@code asset_documents}, dùng bởi {@code AssetDocumentService}.
 */
public interface AssetDocumentRepository extends JpaRepository<AssetDocument, Long> {

	/**
	 * Projection chỉ gồm metadata để liệt kê tài liệu, không bao giờ nạp nội dung mã hóa.
	 *
	 * <ul>
	 * <li>{@code id} - public id; {@code fileName}, {@code contentType}, {@code sizeBytes}, {@code sha256}, {@code createdAt} - metadata</li>
	 * </ul>
	 */
	record Row(UUID id, String fileName, String contentType, long sizeBytes, String sha256, Instant createdAt) { }

	/**
	 * Đếm số tài liệu của một Asset (kiểm tra giới hạn mỗi Asset).
	 *
	 * @param assetId id nội bộ của Asset
	 */
	long countByAssetId(Long assetId);

	/**
	 * Tìm một tài liệu theo public id và phải thuộc đúng Asset (tránh truy cập chéo).
	 *
	 * @return tài liệu hoặc rỗng
	 */
	Optional<AssetDocument> findByPublicIdAndAssetId(UUID publicId, Long assetId);

	/**
	 * Lấy danh sách metadata tài liệu của Asset theo thứ tự tải lên (JPQL tạo trực tiếp {@link Row}, không nạp ciphertext).
	 *
	 * @param assetId id nội bộ của Asset
	 */
	@Query("""
		select new com.legacyvault.asset.repository.AssetDocumentRepository$Row(d.publicId, d.fileName, d.contentType,
			d.size, d.sha256, d.createdAt)
		from AssetDocument d where d.assetId = :assetId order by d.id asc
		""")
	List<Row> findRowsByAssetId(@Param("assetId") Long assetId);
}
