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
 * <b>nội dung (magic bytes)</b>, kèm SHA-256 của byte gốc và tên hiển thị đã làm sạch. Cũng được {@code AssetImageService} dùng lại cho ảnh Asset.
 *
 * <p>SHA-256 chỉ để phát hiện file bị thay đổi, không chứng minh giá trị pháp lý của di chúc (LV-WILL-001).
 *
 * <ul>
 * <li>{@code content} - byte file</li>
 * <li>{@code fileName} - tên hiển thị đã làm sạch</li>
 * <li>{@code contentType} - MIME phát hiện được</li>
 * <li>{@code sha256} - băm SHA-256 hex</li>
 * </ul>
 */
public record WillFile(byte[] content, String fileName, String contentType, String sha256) {

	/**
	 * MIME PDF.
	 */
	static final String PDF = "application/pdf";
	/**
	 * MIME JPEG.
	 */
	static final String JPEG = "image/jpeg";
	/**
	 * MIME PNG.
	 */
	static final String PNG = "image/png";

	/**
	 * Kiểu khai báo chung chung được chấp nhận.
	 */
	private static final Set<String> GENERIC_DECLARED_TYPES = Set.of("application/octet-stream");
	/**
	 * Độ dài tối đa của tên file hiển thị.
	 */
	private static final int MAX_FILE_NAME_LENGTH = 255;

	/**
	 * Kiểm tra file multipart và dựng {@link WillFile}: file rỗng -> VALIDATION_FAILED; vượt {@code maxBytes} -> PAYLOAD_TOO_LARGE;
	 * loại không phải PDF/JPEG/PNG theo magic bytes hoặc khai báo mâu thuẫn -> UNSUPPORTED_MEDIA_TYPE.
	 *
	 * @param file file tải lên
	 * @param maxBytes dung lượng tối đa
	 * @return file đã xác thực kèm SHA-256
	 * @throws com.legacyvault.common.exception.BusinessException theo các trường hợp trên
	 * @throws IllegalStateException nếu không đọc được file
	 */
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

	/**
	 * @return số byte của file
	 */
	public long size() {
		return content.length;
	}

	/**
	 * Loại file theo vài byte đầu; null nếu không phải PDF/JPEG/PNG.
	 *
	 * @param bytes nội dung file
	 */
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
	 * Vd: khai {@code image/png} nhưng nội dung là PDF -> từ chối ({@code image/jpg} được coi như JPEG).
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
	 * Tên chỉ để hiển thị, không bao giờ dùng làm đường dẫn lưu: bỏ phần thư mục (cả {@code /} và dấu gạch chéo ngược),
	 * ký tự điều khiển, cắt còn 255 ký tự; tên rỗng hoặc {@code .}/{@code ..} đổi thành {@code file}.
	 *
	 * @param original tên file client gửi
	 * @return tên đã làm sạch
	 */
	public static String sanitizeFileName(String original) {
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

	/**
	 * Tính SHA-256 dạng hex.
	 *
	 * @param content byte đầu vào
	 * @return chuỗi hex 64 ký tự
	 */
	public static String sha256Hex(byte[] content) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException("SHA-256 not available", ex);
		}
	}

	/**
	 * Kiểm tra mảng byte bắt đầu bằng dãy giá trị (0..255) cho trước.
	 */
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

	/**
	 * Không in nội dung file ra log nếu record bị log nhầm.
	 */
	@Override
	public String toString() {
		return "WillFile[fileName=" + fileName + ", contentType=" + contentType + ", size=" + content.length + "]";
	}
}
