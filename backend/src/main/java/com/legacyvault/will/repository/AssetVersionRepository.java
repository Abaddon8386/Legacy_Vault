package com.legacyvault.will.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import com.legacyvault.will.entity.AssetVersion;

/**
 * Phiên bản file di chúc. Chỉ có thêm mới và đọc metadata: không có hàm sửa/xóa vì phiên bản cũ phải được giữ
 * nguyên làm chứng cứ (LV-WILL-001). Các truy vấn đọc trả {@link WillVersionView} để không nạp nội dung file.
 */
public interface AssetVersionRepository extends Repository<AssetVersion, Long> {

	AssetVersion save(AssetVersion version);

	/** Nạp cả nội dung mã hóa; chỉ dùng cho luồng Owner mở file sau khi xác nhận lại mật khẩu. */
	Optional<AssetVersion> findByAssetIdAndVersionNo(Long assetId, int versionNo);

	@Query("select coalesce(max(v.versionNo), 0) from AssetVersion v where v.assetId = :assetId")
	int findMaxVersionNo(@Param("assetId") Long assetId);

	@Query("""
			select new com.legacyvault.will.repository.WillVersionView(v.assetId, v.versionNo, v.originalFileName,
				v.contentType, v.fileSizeBytes, v.sha256Hash, v.uploadStatus, v.uploadedAt)
			from AssetVersion v where v.assetId = :assetId order by v.versionNo desc""")
	List<WillVersionView> findVersions(@Param("assetId") Long assetId);

	/** Phiên bản mới nhất của từng Asset trong danh sách (một truy vấn cho cả trang). */
	@Query("""
			select new com.legacyvault.will.repository.WillVersionView(v.assetId, v.versionNo, v.originalFileName,
				v.contentType, v.fileSizeBytes, v.sha256Hash, v.uploadStatus, v.uploadedAt)
			from AssetVersion v where v.assetId in :assetIds
			and v.versionNo = (select max(v2.versionNo) from AssetVersion v2 where v2.assetId = v.assetId)""")
	List<WillVersionView> findLatestVersions(@Param("assetIds") Collection<Long> assetIds);
}
