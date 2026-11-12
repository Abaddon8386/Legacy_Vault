package com.legacyvault.asset.dto;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import com.legacyvault.asset.entity.Asset;
import com.legacyvault.asset.entity.AssetType;

/**
 * Response của Asset (assets.md), trả về từ các endpoint trong {@code AssetController}.
 * Không bao giờ chứa payload (plaintext hay ciphertext), chỉ có cờ {@code hasPayload}.
 *
 * <ul>
 * <li>{@code id} - public id (UUID) của Asset</li>
 * <li>{@code vaultId} - public id của Vault chứa Asset</li>
 * <li>{@code name} - tên Asset (cột {@code assets.title})</li>
 * <li>{@code assetType} - loại Asset (TEXT, CREDENTIAL...)</li>
 * <li>{@code description} - mô tả, có thể null</li>
 * <li>{@code hasPayload} - Asset có nội dung mã hóa hay không</li>
 * <li>{@code createdAt}, {@code updatedAt} - thời điểm tạo / sửa (UTC)</li>
 * </ul>
 */
public record AssetResponse(UUID id, UUID vaultId, String name, AssetType assetType, String description,
		boolean hasPayload, Instant createdAt, Instant updatedAt) {

	/**
	 * Dựng response từ entity {@link Asset}, đổi {@code LocalDateTime} (UTC) sang {@link Instant}.
	 *
	 * @param asset entity nguồn
	 * @param vaultPublicId public id của Vault chứa Asset
	 * @return response không chứa payload
	 */
	public static AssetResponse from(Asset asset, UUID vaultPublicId) {
		return new AssetResponse(asset.getPublicId(), vaultPublicId, asset.getName(), asset.getAssetType(),
				asset.getDescription(), asset.hasPayload(), asset.getCreatedAt().toInstant(ZoneOffset.UTC),
				asset.getUpdatedAt().toInstant(ZoneOffset.UTC));
	}
}
