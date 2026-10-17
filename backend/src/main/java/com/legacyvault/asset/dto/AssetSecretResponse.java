package com.legacyvault.asset.dto;

import java.util.UUID;

/**
 * Nội dung bảo mật của một Asset, chỉ trả sau khi Owner xác nhận lại mật khẩu (D-API-32). Không dùng chung
 * {@link AssetResponse}: payload không bao giờ nằm trong response thường.
 */
public record AssetSecretResponse(UUID id, String payload) {

	@Override
	public String toString() {
		return "AssetSecretResponse[id=" + id + ", payload=***]";
	}
}
