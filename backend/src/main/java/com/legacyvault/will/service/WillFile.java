package com.legacyvault.will.service;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;

import org.springframework.web.multipart.MultipartFile;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

/**
 * File di chúc đã qua kiểm tra (PS-17): không rỗng, không vượt giới hạn, đúng loại PDF/JPEG/PNG theo
 * <b>nội dung (magic bytes)</b>, kèm SHA-256 của byte gốc và tên hiển thị đã làm sạch.
 *
 * <p>SHA-256 chỉ để phát hiện file bị thay đổi, không chứng minh giá trị pháp lý của di chúc (LV-WILL-001).
 */
public record WillFile(byte[] content, String fileName, String contentType, String sha256) {

	static final String PDF = "application/pdf";
	static final String JPEG = "image/jpeg";
	static final String PNG = "image/png";

	private static final Set<String> GENERIC_DECLARED_TYPES = Set.of("application/octet-stream");
	private static final int MAX_FILE_NAME_LENGTH = 255;

	public static WillFile inspect(MultipartFile file, long maxBytes) {
		if (file == null || file.isEmpty()) {
			throw new BusinessException(ErrorCode.VALIDATION_FAILED);
		}
		if (file.getSize() > maxBytes) {
			throw new BusinessException(ErrorCode.PAYLOAD_TOO_LARGE);
		}
		byte[] content;
		try {
			content = file.getBytes();
		}
		catch (IOException ex) {
			throw new IllegalStateException("Cannot read uploaded file", ex);
		}
		String detected = detectType(content);
		if (detected == null || !declaredTypeMatches(file.getContentType(), detected)) {
			throw new BusinessException(ErrorCode.UNSUPPORTED_MEDIA_TYPE);
		}
		return new WillFile(content, sanitizeFileName(file.getOriginalFilename()), detected, sha256Hex(content));
	}

	public long size() {
		return content.length;
	}

	/** Loại file theo vài byte đầu; null nếu không phải PDF/JPEG/PNG. */
	static String detectType(byte[] bytes) {
		if (startsWith(bytes, 0x25, 0x50, 0x44, 0x46, 0x2D)) { // "%PDF-"
			return PDF;
		}
		if (startsWith(bytes, 0xFF, 0xD8, 0xFF)) {
			return JPEG;
		}
		if (startsWith(bytes, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) {
			return PNG;
		}
		return null;
	}

	/**
	 * Content-Type client khai báo chỉ được phép trùng với loại phát hiện, hoặc là kiểu chung chung/không khai báo.
	 * Vd: khai {@code image/png} nhưng nội dung là PDF -> từ chối.
	 */
	static boolean declaredTypeMatches(String declared, String detected) {
		if (declared == null || declared.isBlank()) {
			return true;
		}
		String type = declared.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
		if ("image/jpg".equals(type)) {
			type = JPEG;
		}
		return type.equals(detected) || GENERIC_DECLARED_TYPES.contains(type);
	}

	/**
	 * Tên chỉ để hiển thị, không bao giờ dùng làm đường dẫn lưu: bỏ phần thư mục (cả {@code /} và {@code \}),
	 * ký tự điều khiển, cắt còn 255 ký tự.
	 */
	static String sanitizeFileName(String original) {
		if (original == null) {
			return "file";
		}
		String name = original.substring(Math.max(original.lastIndexOf('/'), original.lastIndexOf('\\')) + 1);
		name = name.replaceAll("\\p{Cntrl}", "").trim();
		if (name.isEmpty() || name.equals(".") || name.equals("..")) {
			return "file";
		}
		return name.length() > MAX_FILE_NAME_LENGTH ? name.substring(0, MAX_FILE_NAME_LENGTH) : name;
	}

	static String sha256Hex(byte[] content) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException("SHA-256 not available", ex);
		}
	}

	private static boolean startsWith(byte[] bytes, int... prefix) {
		if (bytes.length < prefix.length) {
			return false;
		}
		for (int i = 0; i < prefix.length; i++) {
			if ((bytes[i] & 0xFF) != prefix[i]) {
				return false;
			}
		}
		return true;
	}

	/** Không in nội dung file ra log nếu record bị log nhầm. */
	@Override
	public String toString() {
		return "WillFile[fileName=" + fileName + ", contentType=" + contentType + ", size=" + content.length + "]";
	}
}
