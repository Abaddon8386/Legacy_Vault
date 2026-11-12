package com.legacyvault.will.repository;

import java.time.LocalDateTime;

/**
 * Metadata một phiên bản file (không có nội dung file) — kết quả projection của {@link AssetVersionRepository}.
 *
 * <ul>
 * <li>{@code assetId}, {@code versionNo} - định danh phiên bản</li>
 * <li>{@code originalFileName}, {@code contentType}, {@code fileSizeBytes}, {@code sha256Hash} - metadata toàn vẹn</li>
 * <li>{@code uploadStatus}, {@code uploadedAt} - trạng thái và thời điểm tải lên (UTC)</li>
 * </ul>
 */
public record WillVersionView(Long assetId, int versionNo, String originalFileName, String contentType,
		long fileSizeBytes, String sha256Hash, String uploadStatus, LocalDateTime uploadedAt) {
}
