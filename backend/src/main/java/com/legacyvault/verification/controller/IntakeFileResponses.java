package com.legacyvault.verification.controller;

import java.nio.charset.StandardCharsets;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import com.legacyvault.verification.service.IntakeAttachmentService.IntakeFile;

/**
 * PS-103: file bằng chứng là byte do người dùng cung cấp nên luôn trả dạng attachment, không sniff, không cache và
 * không cho chạy nội dung chủ động. Frontend xem trước từ blob đã tải.
 */
final class IntakeFileResponses {

	private IntakeFileResponses() { }

	/**
	 * Dựng {@link ResponseEntity} 200 cho một file bằng chứng: đặt content-type theo file, {@code nosniff},
	 * CSP {@code default-src 'none'; sandbox}, {@code no-store} và {@code Content-Disposition: attachment}.
	 * Được các controller đính kèm (Staff/Legal) và đối soát người thụ hưởng dùng.
	 *
	 * @param file nội dung và metadata file
	 * @return response chứa byte của file
	 */
	static ResponseEntity<byte[]> of(IntakeFile file) {
		return ResponseEntity.ok()
				.contentType(MediaType.parseMediaType(file.contentType()))
				.contentLength(file.content().length)
				.cacheControl(CacheControl.noStore())
				.header("X-Content-Type-Options", "nosniff")
				.header("Content-Security-Policy", "default-src 'none'; sandbox")
				.header(HttpHeaders.CONTENT_DISPOSITION,
						ContentDisposition.attachment().filename(file.fileName(), StandardCharsets.UTF_8).build().toString())
				.body(file.content());
	}
}
