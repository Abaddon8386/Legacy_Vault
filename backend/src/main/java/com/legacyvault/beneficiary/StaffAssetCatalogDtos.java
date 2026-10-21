package com.legacyvault.beneficiary;

import java.util.UUID;

import com.legacyvault.asset.entity.Asset;

/** PS-118 public, pre-unlock asset catalog. Deliberately excludes descriptions and all secret/content fields. */
public final class StaffAssetCatalogDtos {
	private StaffAssetCatalogDtos() { }

	public record Item(UUID assetId, String assetType, String name) {
		public static Item from(Asset asset) {
			return new Item(asset.getPublicId(), asset.getAssetType().name(), asset.getName());
		}
	}
}
