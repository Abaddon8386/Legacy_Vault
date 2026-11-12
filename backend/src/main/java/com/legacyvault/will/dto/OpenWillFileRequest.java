package com.legacyvault.will.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Yêu cầu mở/tải file di chúc: Owner nhập lại mật khẩu đăng nhập hiện tại (D-API-33), body của
 * {@code POST /api/v1/vaults/{vaultId}/wills/{willId}/versions/{version}/download}. Độ dài tối đa bằng giới hạn
 * BCrypt; không kiểm tra độ dài tối thiểu vì chỉ để so khớp.
 *
 * <ul>
 * <li>{@code password} - mật khẩu đăng nhập hiện tại, không rỗng, tối đa 72 ký tự</li>
 * </ul>
 */
public record OpenWillFileRequest(@NotBlank @Size(max = 72) String password) {

	/**
	 * Che mật khẩu khi in.
	 */
	@Override
	public String toString() {
		return "OpenWillFileRequest[password=***]";
	}
}
