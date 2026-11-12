package com.legacyvault.beneficiary;

import java.util.UUID;

import com.legacyvault.asset.entity.Asset;

/** PS-118 public, pre-unlock asset catalog. Deliberately excludes descriptions and all secret/content fields. */
public final class StaffAssetCatalogDtos {
	/**
	 * Lớp tiện ích, không cho khởi tạo.
	 */
	private StaffAssetCatalogDtos() { }

	/**
	 * Một tài sản trong danh mục: {@code assetId} mã công khai, {@code assetType} loại tài sản, {@code name} tên.
	 */
	public record Item(UUID assetId, String assetType, String name) {
		/**
		 * Chuyển thực thể {@code Asset} sang {@code Item}.
		 */
		public static Item from(Asset asset) {
			return new Item(asset.getPublicId(), asset.getAssetType().name(), asset.getName());
		}
	}
}
