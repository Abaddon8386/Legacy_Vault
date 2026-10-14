package com.legacyvault.will.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

/** PS-17/PS-18: kiểm tra file di chúc — loại theo nội dung, giới hạn, SHA-256, tên file an toàn. */
class WillFileTest {

	static final byte[] PDF = "%PDF-1.7\nnoi dung di chuc".getBytes(StandardCharsets.US_ASCII);
	static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3 };
	static final byte[] JPEG = { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 1, 2 };
	private static final long LIMIT = 1024;

	private static MockMultipartFile file(String name, String contentType, byte[] content) {
		return new MockMultipartFile("file", name, contentType, content);
	}

	private static ErrorCode errorOf(MockMultipartFile file) {
		try {
			WillFile.inspect(file, LIMIT);
			return null;
		}
		catch (BusinessException ex) {
			return ex.getErrorCode();
		}
	}

	@Test
	void acceptsPdfJpegPng_byContent() {
		assertThat(WillFile.inspect(file("a.pdf", "application/pdf", PDF), LIMIT).contentType())
				.isEqualTo("application/pdf");
		assertThat(WillFile.inspect(file("a.png", "image/png", PNG), LIMIT).contentType()).isEqualTo("image/png");
		assertThat(WillFile.inspect(file("a.jpg", "image/jpeg", JPEG), LIMIT).contentType()).isEqualTo("image/jpeg");
		assertThat(WillFile.inspect(file("a.jpg", "image/jpg", JPEG), LIMIT).contentType()).isEqualTo("image/jpeg");
		// Client không khai hoặc khai chung chung: tin vào nội dung.
		assertThat(WillFile.inspect(file("a", null, PDF), LIMIT).contentType()).isEqualTo("application/pdf");
		assertThat(WillFile.inspect(file("a", "application/octet-stream", PNG), LIMIT).contentType())
				.isEqualTo("image/png");
	}

	@Test
	void rejectsOtherContent_evenWithAllowedExtensionOrContentType() {
		byte[] exe = { 'M', 'Z', 0, 0 };
		assertThat(errorOf(file("di-chuc.pdf", "application/pdf", exe))).isEqualTo(ErrorCode.UNSUPPORTED_MEDIA_TYPE);
		assertThat(errorOf(file("x.txt", "text/plain", "hello".getBytes())))
				.isEqualTo(ErrorCode.UNSUPPORTED_MEDIA_TYPE);
	}

	@Test
	void rejectsDeclaredTypeThatContradictsContent() {
		assertThat(errorOf(file("a.png", "image/png", PDF))).isEqualTo(ErrorCode.UNSUPPORTED_MEDIA_TYPE);
		assertThat(errorOf(file("a.pdf", "text/html", PDF))).isEqualTo(ErrorCode.UNSUPPORTED_MEDIA_TYPE);
	}

	@Test
	void rejectsEmptyOrMissingFile_andTooLarge() {
		assertThat(errorOf(file("a.pdf", "application/pdf", new byte[0]))).isEqualTo(ErrorCode.VALIDATION_FAILED);
		assertThatThrownBy(() -> WillFile.inspect(null, LIMIT))
				.extracting(ex -> ((BusinessException) ex).getErrorCode()).isEqualTo(ErrorCode.VALIDATION_FAILED);
		byte[] big = new byte[(int) LIMIT + 1];
		System.arraycopy(PDF, 0, big, 0, PDF.length);
		assertThat(errorOf(file("a.pdf", "application/pdf", big))).isEqualTo(ErrorCode.PAYLOAD_TOO_LARGE);
	}

	@Test
	void sha256_isLowercaseHexOfOriginalBytes_andChangesWhenFileChanges() {
		// Vector chuẩn của SHA-256("abc").
		assertThat(WillFile.sha256Hex("abc".getBytes(StandardCharsets.US_ASCII)))
				.isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

		byte[] changed = PDF.clone();
		changed[changed.length - 1] ^= 0x01;
		String original = WillFile.inspect(file("a.pdf", null, PDF), LIMIT).sha256();
		assertThat(original).matches("[0-9a-f]{64}");
		assertThat(WillFile.inspect(file("a.pdf", null, changed), LIMIT).sha256()).isNotEqualTo(original);
		assertThat(WillFile.inspect(file("b.pdf", null, PDF), LIMIT).sha256()).isEqualTo(original);
	}

	@Test
	void fileName_isSanitizedForDisplayOnly() {
		assertThat(WillFile.sanitizeFileName("../../etc/passwd")).isEqualTo("passwd");
		assertThat(WillFile.sanitizeFileName("C:\\Users\\a\\di-chuc.pdf")).isEqualTo("di-chuc.pdf");
		assertThat(WillFile.sanitizeFileName("di\u0000chuc\n.pdf")).isEqualTo("dichuc.pdf");
		assertThat(WillFile.sanitizeFileName("..")).isEqualTo("file");
		assertThat(WillFile.sanitizeFileName(null)).isEqualTo("file");
		assertThat(WillFile.sanitizeFileName("a".repeat(300) + ".pdf")).hasSize(255);
	}

	@Test
	void toString_doesNotExposeContent() {
		assertThat(WillFile.inspect(file("a.pdf", null, PDF), LIMIT).toString())
				.doesNotContain("noi dung").contains("size=");
	}
}
