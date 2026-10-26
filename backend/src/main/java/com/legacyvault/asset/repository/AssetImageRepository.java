package com.legacyvault.asset.repository;

import com.legacyvault.asset.entity.AssetImage;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;

public interface AssetImageRepository extends JpaRepository<AssetImage, Long> {
    List<AssetImage> findByAssetIdOrderBySlotAsc(Long assetId);
    Optional<AssetImage> findByPublicIdAndAssetId(UUID publicId, Long assetId);
}
