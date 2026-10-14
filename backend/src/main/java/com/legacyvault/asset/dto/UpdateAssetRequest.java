package com.legacyvault.asset.dto;

import com.legacyvault.asset.validation.PayloadSize;
import com.legacyvault.common.validation.NullOrNotBlank;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Size;

/**
 * Cập nhật một phần Asset (PATCH, D-API-24). Chỉ ba trường này đổi được; vắng hoặc null = giữ nguyên.
 * {@code assetType}, {@code vaultId}, {@code id} không có ở đây nên bị bỏ qua nếu client gửi.
 * {@code description} gửi chuỗi rỗng = xóa mô tả.
 */
public record UpdateAssetRequest(
		@NullOrNotBlank @Size(max = 150) String name,
		@Size(max = 1000) String description,
		@NullOrNotBlank @PayloadSize String payload) {

	/** Body không có trường hợp lệ nào (vd {@code {}} hoặc chỉ có trường bị bỏ qua) -> 400 VALIDATION_FAILED. */
	@AssertTrue(message = "validation.atLeastOneField")
	public boolean isAnyFieldPresent() {
		return name != null || description != null || payload != null;
	}

	/** Record tự sinh toString có cả payload; ghi đè để payload không bao giờ lọt vào log. */
	@Override
	public String toString() {
		return "UpdateAssetRequest[name=" + name + ", descriptionPresent=" + (description != null)
				+ ", payload=" + (payload == null ? "null" : "***") + "]";
	}
}
