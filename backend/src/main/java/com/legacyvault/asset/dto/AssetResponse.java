package com.legacyvault.asset.dto;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import com.legacyvault.asset.entity.Asset;
import com.legacyvault.asset.entity.AssetType;

/** Response của Asset (assets.md). Không bao giờ có payload (plaintext hay ciphertext) — chỉ {@code hasPayload}. */
public record AssetResponse(UUID id, UUID vaultId, String name, AssetType assetType, String description,
		boolean hasPayload, Instant createdAt, Instant updatedAt) {

	public static AssetResponse from(Asset asset, UUID vaultPublicId) {
		return new AssetResponse(asset.getPublicId(), vaultPublicId, asset.getName(), asset.getAssetType(),
				asset.getDescription(), asset.hasPayload(), asset.getCreatedAt().toInstant(ZoneOffset.UTC),
				asset.getUpdatedAt().toInstant(ZoneOffset.UTC));
	}
}
