package com.legacyvault.will.dto;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import com.legacyvault.asset.entity.Asset;
import com.legacyvault.will.repository.WillVersionView;

/**
 * {@code WillResponse} trong wills.md. {@code status} lấy từ trạng thái tải lên của phiên bản hiện tại
 * ({@code asset_versions.upload_status}), không lấy từ trạng thái thẩm định của Legal — API này chỉ có {@code UPLOADED}.
 */
public record WillResponse(UUID id, UUID vaultId, String status, WillVersionResponse currentVersion,
		Instant createdAt) {

	public static WillResponse from(Asset will, UUID vaultPublicId, WillVersionView currentVersion) {
		return new WillResponse(will.getPublicId(), vaultPublicId, currentVersion.uploadStatus(),
				WillVersionResponse.from(currentVersion), will.getCreatedAt().toInstant(ZoneOffset.UTC));
	}
}
