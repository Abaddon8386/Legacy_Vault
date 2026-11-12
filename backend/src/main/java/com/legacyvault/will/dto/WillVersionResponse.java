package com.legacyvault.will.dto;

import java.time.Instant;
import java.time.ZoneOffset;

import com.legacyvault.will.repository.WillVersionView;

/**
 * {@code WillVersion} trong wills.md: metadata toàn vẹn của một phiên bản file, không có nội dung file.
 *
 * <ul>
 * <li>{@code version} - số phiên bản (từ 1)</li>
 * <li>{@code fileName} - tên file gốc đã làm sạch</li>
 * <li>{@code contentType} - PDF, JPEG hoặc PNG</li>
 * <li>{@code sizeBytes} - kích thước byte</li>
 * <li>{@code sha256} - băm SHA-256 của byte gốc</li>
 * <li>{@code uploadedAt} - thời điểm tải lên (UTC)</li>
 * </ul>
 */
public record WillVersionResponse(int version, String fileName, String contentType, long sizeBytes, String sha256,
		Instant uploadedAt) {

	/**
	 * Dựng response từ {@link WillVersionView}, đổi thời gian UTC sang {@code Instant}.
	 */
	public static WillVersionResponse from(WillVersionView view) {
		return new WillVersionResponse(view.versionNo(), view.originalFileName(), view.contentType(),
				view.fileSizeBytes(), view.sha256Hash(), view.uploadedAt().toInstant(ZoneOffset.UTC));
	}
}
