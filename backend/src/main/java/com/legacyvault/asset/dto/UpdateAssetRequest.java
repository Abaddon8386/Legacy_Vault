package com.legacyvault.asset.dto;

import com.legacyvault.asset.validation.PayloadSize;
import com.legacyvault.common.validation.NullOrNotBlank;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Cập nhật một phần Asset (PATCH, D-API-24). Chỉ ba trường này đổi được; vắng hoặc null = giữ nguyên.
 * {@code assetType}, {@code vaultId}, {@code id} không có ở đây nên bị bỏ qua nếu client gửi.
 * {@code description} gửi chuỗi rỗng = xóa mô tả.
 *
 * <p>PS-111 (D-API-40): mọi lần sửa phải kèm {@code password} là mật khẩu đăng nhập hiện tại; server tự xác thực lại,
 * không tin cờ "đã xác nhận" từ FE.
 */
public record UpdateAssetRequest(
		@NullOrNotBlank @Size(max = 150) String name,
		@Size(max = 1000) String description,
		@NullOrNotBlank @PayloadSize String payload,
		@NotBlank @Size(max = 72) String password) {

	/** Body không có trường hợp lệ nào (vd {@code {}} hoặc chỉ có trường bị bỏ qua) -> 400 VALIDATION_FAILED. */
	@AssertTrue(message = "validation.atLeastOneField")
	public boolean isAnyFieldPresent() {
		return name != null || description != null || payload != null;
	}

	/** Record tự sinh toString có cả payload và mật khẩu; ghi đè để chúng không bao giờ lọt vào log. */
	@Override
	public String toString() {
		return "UpdateAssetRequest[name=" + name + ", descriptionPresent=" + (description != null)
				+ ", payload=" + (payload == null ? "null" : "***") + ", password=***]";
	}
}
