package com.legacyvault.asset.dto;

import com.legacyvault.asset.validation.PayloadSize;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request tạo Asset (assets.md), body của {@code POST /api/v1/vaults/{vaultId}/assets} (và part {@code asset} của
 * {@code POST .../assets/with-images}). {@code assetType} nhận chuỗi để loại sai/FILE trả 400 VALIDATION_FAILED có lỗi theo
 * trường, thay vì lỗi đọc JSON. Trường thừa ({@code vaultId}, {@code id}, {@code status}...) bị bỏ qua.
 *
 * <ul>
 * <li>{@code name} - bắt buộc, tối đa 150 ký tự</li>
 * <li>{@code assetType} - bắt buộc, chỉ {@code TEXT} hoặc {@code CREDENTIAL}</li>
 * <li>{@code description} - tùy chọn, tối đa 1000 ký tự</li>
 * <li>{@code payload} - bắt buộc, không vượt giới hạn byte UTF-8 ({@link com.legacyvault.asset.validation.PayloadSize}); được mã hóa trước khi lưu</li>
 * </ul>
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
