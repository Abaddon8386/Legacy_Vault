package com.legacyvault.asset.repository;

import com.legacyvault.asset.entity.AssetImage;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;

/**
 * Repository JPA cho bảng {@code asset_images}, dùng bởi {@code AssetImageService}.
 */
public interface AssetImageRepository extends JpaRepository<AssetImage, Long> {
    /**
     * Danh sách ảnh của một Asset theo thứ tự slot tăng dần.
     */
    List<AssetImage> findByAssetIdOrderBySlotAsc(Long assetId);
    /**
     * Tìm ảnh theo public id và phải thuộc đúng Asset.
     */
    Optional<AssetImage> findByPublicIdAndAssetId(UUID publicId, Long assetId);
}
