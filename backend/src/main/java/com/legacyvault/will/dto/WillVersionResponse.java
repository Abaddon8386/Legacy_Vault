package com.legacyvault.will.dto;

import java.time.Instant;
import java.time.ZoneOffset;

import com.legacyvault.will.repository.WillVersionView;

/** {@code WillVersion} trong wills.md: metadata toàn vẹn của một phiên bản file, không có nội dung file. */
public record WillVersionResponse(int version, String fileName, String contentType, long sizeBytes, String sha256,
		Instant uploadedAt) {

	public static WillVersionResponse from(WillVersionView view) {
		return new WillVersionResponse(view.versionNo(), view.originalFileName(), view.contentType(),
				view.fileSizeBytes(), view.sha256Hash(), view.uploadedAt().toInstant(ZoneOffset.UTC));
	}
}
