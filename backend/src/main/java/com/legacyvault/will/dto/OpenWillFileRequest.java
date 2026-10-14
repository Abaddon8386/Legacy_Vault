package com.legacyvault.will.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Yêu cầu mở/tải file di chúc: Owner nhập lại mật khẩu đăng nhập hiện tại (D-API-33). Độ dài tối đa bằng giới hạn
 * BCrypt; không kiểm tra độ dài tối thiểu vì chỉ để so khớp.
 */
public record OpenWillFileRequest(@NotBlank @Size(max = 72) String password) {

	/** Record tự sinh toString có cả mật khẩu; ghi đè để mật khẩu không bao giờ lọt vào log. */
	@Override
	public String toString() {
		return "OpenWillFileRequest[password=***]";
	}
}
