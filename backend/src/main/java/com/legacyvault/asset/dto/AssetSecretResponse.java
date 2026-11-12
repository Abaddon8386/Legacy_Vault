package com.legacyvault.asset.dto;

import java.util.UUID;

/**
 * Nội dung bảo mật của một Asset, chỉ trả sau khi Owner xác nhận lại mật khẩu (D-API-32) qua
 * {@code POST /api/v1/vaults/{vaultId}/assets/{assetId}/reveal}. Không dùng chung {@link AssetResponse}: payload không bao
 * giờ nằm trong response thường.
 *
 * <ul>
 * <li>{@code id} - public id của Asset</li>
 * <li>{@code payload} - nội dung đã giải mã</li>
 * </ul>
 */
public record AssetSecretResponse(UUID id, String payload) {

	/**
	 * Che payload để không lọt vào log.
	 */
	@Override
	public String toString() {
		return "AssetSecretResponse[id=" + id + ", payload=***]";
	}
}
