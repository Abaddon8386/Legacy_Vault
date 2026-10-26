package com.legacyvault.verification.controller;

import java.nio.charset.StandardCharsets;

import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import com.legacyvault.verification.service.IntakeAttachmentService.IntakeFile;

/**
 * PS-103: evidence files are user-supplied bytes, so they are always an attachment, never sniffed, never cached and
 * never allowed to run active content. The FE previews them from a fetched blob.
 */
final class IntakeFileResponses {

	private IntakeFileResponses() { }

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
