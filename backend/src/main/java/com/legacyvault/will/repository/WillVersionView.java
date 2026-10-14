package com.legacyvault.will.repository;

import java.time.LocalDateTime;

/** Metadata một phiên bản file (không có nội dung file) — kết quả projection của {@link AssetVersionRepository}. */
public record WillVersionView(Long assetId, int versionNo, String originalFileName, String contentType,
		long fileSizeBytes, String sha256Hash, String uploadStatus, LocalDateTime uploadedAt) {
}
