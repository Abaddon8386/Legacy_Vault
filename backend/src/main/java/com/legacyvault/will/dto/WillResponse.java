package com.legacyvault.will.dto;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

import com.legacyvault.asset.entity.Asset;
import com.legacyvault.will.repository.WillVersionView;

/**
 * {@code WillResponse} trong wills.md, trả bởi {@code WillController}. {@code status} lấy từ trạng thái tải lên của phiên bản hiện tại
 * ({@code asset_versions.upload_status}), không lấy từ trạng thái thẩm định của Legal — API này chỉ có {@code UPLOADED}.
 *
 * <ul>
 * <li>{@code id} - public id của di chúc (Asset DOCUMENT)</li>
 * <li>{@code vaultId} - public id của Vault</li>
 * <li>{@code status} - trạng thái tải lên của phiên bản hiện tại</li>
 * <li>{@code currentVersion} - metadata phiên bản mới nhất ({@link WillVersionResponse})</li>
 * <li>{@code createdAt} - thời điểm tạo hồ sơ (UTC)</li>
 * </ul>
 */
public record WillResponse(UUID id, UUID vaultId, String status, WillVersionResponse currentVersion,
		Instant createdAt) {

	/**
	 * Dựng response từ Asset di chúc và view phiên bản hiện tại.
	 *
	 * @param will Asset di chúc
	 * @param vaultPublicId public id của Vault
	 * @param currentVersion phiên bản mới nhất
	 * @return response
	 */
	public static WillResponse from(Asset will, UUID vaultPublicId, WillVersionView currentVersion) {
		return new WillResponse(will.getPublicId(), vaultPublicId, currentVersion.uploadStatus(),
				WillVersionResponse.from(currentVersion), will.getCreatedAt().toInstant(ZoneOffset.UTC));
	}
}
