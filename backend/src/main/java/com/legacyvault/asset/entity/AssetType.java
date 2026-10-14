package com.legacyvault.asset.entity;

/**
 * Giá trị {@code assets.asset_type}. {@code DOCUMENT} dành cho di chúc số hóa (PS-17, đi qua {@code /wills}),
 * không xuất hiện ở API Asset. Sprint 1 chỉ tạo được {@code TEXT}, {@code CREDENTIAL} (D-API-13).
 */
public enum AssetType {
	TEXT,
	CREDENTIAL,
	FILE,
	DOCUMENT
}
