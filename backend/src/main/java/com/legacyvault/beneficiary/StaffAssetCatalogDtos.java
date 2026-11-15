package com.legacyvault.beneficiary;

import java.util.UUID;

import com.legacyvault.asset.entity.Asset;

/** PS-118: danh mục tài sản công khai trước khi mở khóa. Cố ý loại bỏ mô tả và mọi trường bí mật/nội dung. */
public final class StaffAssetCatalogDtos {
	private StaffAssetCatalogDtos() { }

	public record Item(UUID assetId, String assetType, String name) {
		public static Item from(Asset asset) {
			return new Item(asset.getPublicId(), asset.getAssetType().name(), asset.getName());
		}
	}
}
