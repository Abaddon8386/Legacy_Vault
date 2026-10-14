package com.legacyvault.asset.dto;

import com.legacyvault.asset.validation.PayloadSize;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request tạo Asset (assets.md). {@code assetType} nhận chuỗi để loại sai/FILE trả 400 VALIDATION_FAILED có lỗi theo
 * trường, thay vì lỗi đọc JSON. Trường thừa ({@code vaultId}, {@code id}, {@code status}...) bị bỏ qua.
 */
public record CreateAssetRequest(
		@NotBlank @Size(max = 150) String name,
		@NotBlank @Pattern(regexp = "TEXT|CREDENTIAL", message = "validation.assetType") String assetType,
		@Size(max = 1000) String description,
		@NotBlank @PayloadSize String payload) {

	/** Record tự sinh toString có cả payload; ghi đè để payload không bao giờ lọt vào log. */
	@Override
	public String toString() {
		return "CreateAssetRequest[name=" + name + ", assetType=" + assetType + ", payload=***]";
	}
}
