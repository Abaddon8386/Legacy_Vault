package com.legacyvault.asset.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Yêu cầu xem nội dung bảo mật của Asset: Owner nhập lại mật khẩu đăng nhập hiện tại (D-API-32). Dùng làm body cho
 * {@code POST .../assets/{assetId}/reveal} và các endpoint tải tài liệu / ảnh ({@code .../download}).
 * Độ dài tối đa bằng giới hạn BCrypt; không kiểm tra độ dài tối thiểu vì chỉ để so khớp.
 *
 * <ul>
 * <li>{@code password} - mật khẩu đăng nhập hiện tại, không rỗng, tối đa 72 ký tự</li>
 * </ul>
 */
public record RevealAssetRequest(@NotBlank @Size(max = 72) String password) {

	/** Record tự sinh toString có cả mật khẩu; ghi đè để mật khẩu không bao giờ lọt vào log. */
	@Override
	public String toString() {
		return "RevealAssetRequest[password=***]";
	}
}
