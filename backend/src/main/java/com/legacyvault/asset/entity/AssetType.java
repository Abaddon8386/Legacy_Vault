package com.legacyvault.asset.entity;

/**
 * Giá trị {@code assets.asset_type}. {@code DOCUMENT} dành cho di chúc số hóa (PS-17, đi qua {@code /wills}),
 * không xuất hiện ở API Asset. Sprint 1 chỉ tạo được {@code TEXT}, {@code CREDENTIAL} (D-API-13).
 *
 * <ul>
 * <li>{@code TEXT} - ghi chú văn bản bảo mật</li>
 * <li>{@code CREDENTIAL} - thông tin đăng nhập</li>
 * <li>{@code FILE} - tệp (chưa mở qua API tạo Asset)</li>
 * <li>{@code DOCUMENT} - di chúc số hóa, quản lý bởi module will</li>
 * </ul>
 */
public enum AssetType {
	TEXT,
	CREDENTIAL,
	FILE,
	DOCUMENT
}
