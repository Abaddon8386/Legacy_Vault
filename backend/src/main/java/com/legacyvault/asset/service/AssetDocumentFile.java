package com.legacyvault.asset.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.web.multipart.MultipartFile;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import com.legacyvault.will.service.WillFile;

/**
 * PS-114 (D-API-43): tài liệu đính kèm Asset, được xác thực theo <b>nội dung</b>, không bao giờ tin tên hay kiểu khai báo.
 * Cho phép: PDF, Word cũ (.doc, OLE2) và Word 2007+ (.docx). File có macro (.docm, VBA trong .doc) và mọi container
 * OLE2/ZIP khác bị từ chối, nên byte lưu xuống luôn là tài liệu thuần. Server không phân tích hay render tài liệu ngoài
 * bước kiểm tra cấu trúc này.
 *
 * <p>Được {@code AssetDocumentService.add} gọi qua {@link #inspect}; lỗi ném {@code BusinessException}.
 *
 * <ul>
 * <li>{@code content} - byte file gốc</li>
 * <li>{@code fileName} - tên file đã làm sạch</li>
 * <li>{@code contentType} - MIME phát hiện theo nội dung (PDF, DOC hoặc DOCX)</li>
 * <li>{@code sha256} - băm SHA-256 hex của nội dung</li>
 * </ul>
 */
public record AssetDocumentFile(byte[] content, String fileName, String contentType, String sha256) {

	/**
	 * MIME của PDF.
	 */
	public static final String PDF = "application/pdf";
	/**
	 * MIME của Word cũ (.doc).
	 */
	public static final String DOC = "application/msword";
	/**
	 * MIME của Word 2007+ (.docx).
	 */
	public static final String DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
	/**
	 * Tập MIME được phép lưu.
	 */
	public static final Set<String> TYPES = Set.of(PDF, DOC, DOCX);

	/**
	 * Kiểu khai báo chung chung được chấp nhận khi client không biết kiểu chính xác.
	 */
	private static final Set<String> GENERIC = Set.of("application/octet-stream");
	/**
	 * Giới hạn số entry trong file ZIP (.docx) để chống zip bomb.
	 */
	private static final int MAX_ZIP_ENTRIES = 5_000;
	/**
	 * Giới hạn tổng dung lượng sau giải nén của .docx (200 MB) để chống zip bomb.
	 */
	private static final long MAX_UNCOMPRESSED_BYTES = 200L * 1024 * 1024;
	/**
	 * Magic bytes mở đầu container OLE2 (file .doc).
	 */
	private static final byte[] OLE2 = { (byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1 };
	/**
	 * Tên stream {@code WordDocument} (UTF-16LE), dấu hiệu tài liệu Word trong OLE2.
	 */
	private static final byte[] WORD_STREAM = utf16("WordDocument");
	/**
	 * Tên stream {@code _VBA_PROJECT} (UTF-16LE), dấu hiệu có macro VBA -> bị từ chối.
	 */
	private static final byte[] VBA_STREAM = utf16("_VBA_PROJECT");

	/**
	 * Kiểm tra file tải lên và dựng {@link AssetDocumentFile}.
	 *
	 * Các bước: từ chối file rỗng (VALIDATION_FAILED) hoặc quá {@code maxBytes} (PAYLOAD_TOO_LARGE); đọc byte; phát hiện loại
	 * theo nội dung bằng {@link #detect}; kiểm tra Content-Type khai báo không mâu thuẫn; làm sạch tên file và tính SHA-256.
	 *
	 * @param file file multipart từ request
	 * @param maxBytes dung lượng tối đa mỗi file
	 * @return tài liệu đã xác thực
	 * @throws com.legacyvault.common.exception.BusinessException VALIDATION_FAILED, PAYLOAD_TOO_LARGE hoặc UNSUPPORTED_MEDIA_TYPE
	 * @throws IllegalStateException nếu không đọc được file
	 */
	public static AssetDocumentFile inspect(MultipartFile file, long maxBytes) {
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
		String detected = detect(content);
		if (detected == null || !declaredMatches(file.getContentType(), detected)) {
			throw new BusinessException(ErrorCode.UNSUPPORTED_MEDIA_TYPE);
		}
		return new AssetDocumentFile(content, WillFile.sanitizeFileName(file.getOriginalFilename()), detected,
				WillFile.sha256Hex(content));
	}

	/**
	 * @return số byte của nội dung file
	 */
	public long size() {
		return content.length;
	}

	/**
	 * Phát hiện loại tài liệu theo magic bytes: {@code %PDF-} -> PDF; {@code PK} -> .docx nếu là ZIP Word thuần;
	 * OLE2 -> .doc nếu là Word thuần không macro.
	 *
	 * @param bytes nội dung file
	 * @return MIME phát hiện được, hoặc null nếu không hỗ trợ / có macro
	 */
	static String detect(byte[] bytes) {
		if (startsWith(bytes, '%', 'P', 'D', 'F', '-')) {
			return PDF;
		}
		if (startsWith(bytes, 'P', 'K', 0x03, 0x04)) {
			return isPlainDocx(bytes) ? DOCX : null;
		}
		if (startsWith(bytes, OLE2)) {
			return isPlainWordDoc(bytes) ? DOC : null;
		}
		return null;
	}

	/**
	 * Zip chứa thân Word ({@code word/document.xml}, {@code [Content_Types].xml}) và không có dự án macro (vbaProject.bin, ActiveX);
	 * số entry và tổng dung lượng giải nén bị chặn chống zip bomb; đường dẫn entry lạ ({@code ..}, {@code /}, {@code \}) bị từ chối.
	 *
	 * @return true nếu là .docx thuần
	 */
	private static boolean isPlainDocx(byte[] bytes) {
		boolean contentTypes = false, wordBody = false;
		int entries = 0;
		long total = 0;
		try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
			ZipEntry entry;
			byte[] buffer = new byte[8192];
			while ((entry = zip.getNextEntry()) != null) {
				if (++entries > MAX_ZIP_ENTRIES) {
					return false;
				}
				String name = entry.getName().toLowerCase(Locale.ROOT);
				if (name.startsWith("/") || name.contains("..") || name.contains("\\")) {
					return false;
				}
				if (name.endsWith("vbaproject.bin") || name.endsWith("activex") || name.contains("/activex/")) {
					return false;
				}
				if (name.equals("[content_types].xml")) {
					contentTypes = true;
				}
				if (name.equals("word/document.xml")) {
					wordBody = true;
				}
				int read;
				while ((read = zip.read(buffer)) > 0) {
					total += read;
					if (total > MAX_UNCOMPRESSED_BYTES) {
						return false;
					}
				}
			}
		}
		catch (IOException | RuntimeException malformed) {
			return false;
		}
		return contentTypes && wordBody;
	}

	/**
	 * Container OLE2 có stream Word và không có dự án VBA (Excel/PowerPoint/MSI và Word có macro bị từ chối).
	 *
	 * @return true nếu là .doc thuần
	 */
	private static boolean isPlainWordDoc(byte[] bytes) {
		return indexOf(bytes, WORD_STREAM) >= 0 && indexOf(bytes, VBA_STREAM) < 0;
	}

	/**
	 * Content-Type client khai báo phải khớp loại phát hiện, hoặc rỗng, hoặc chung chung ({@code application/octet-stream}).
	 *
	 * @param declared kiểu khai báo
	 * @param detected kiểu phát hiện theo nội dung
	 */
	private static boolean declaredMatches(String declared, String detected) {
		if (declared == null || declared.isBlank()) {
			return true;
		}
		String type = declared.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
		return type.equals(detected) || GENERIC.contains(type);
	}

	/**
	 * Mã hóa chuỗi sang UTF-16LE để dò tên stream trong OLE2.
	 */
	private static byte[] utf16(String text) {
		return text.getBytes(java.nio.charset.StandardCharsets.UTF_16LE);
	}

	/**
	 * Kiểm tra mảng byte bắt đầu bằng tiền tố cho trước (so sánh theo giá trị không dấu).
	 */
	private static boolean startsWith(byte[] bytes, int... prefix) {
		if (bytes.length < prefix.length) {
			return false;
		}
		for (int i = 0; i < prefix.length; i++) {
			if ((bytes[i] & 0xFF) != (prefix[i] & 0xFF)) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Kiểm tra mảng byte bắt đầu bằng mảng tiền tố (dùng cho magic OLE2).
	 */
	private static boolean startsWith(byte[] bytes, byte[] prefix) {
		if (bytes.length < prefix.length) {
			return false;
		}
		for (int i = 0; i < prefix.length; i++) {
			if (bytes[i] != prefix[i]) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Tìm vị trí đầu tiên của {@code needle} trong {@code haystack}; trả -1 nếu không có.
	 */
	private static int indexOf(byte[] haystack, byte[] needle) {
		outer:
		for (int i = 0; i <= haystack.length - needle.length; i++) {
			for (int j = 0; j < needle.length; j++) {
				if (haystack[i + j] != needle[j]) {
					continue outer;
				}
			}
			return i;
		}
		return -1;
	}

	/**
	 * Chỉ in loại và kích thước, không in nội dung.
	 */
	@Override
	public String toString() {
		return "AssetDocumentFile[type=" + contentType + ", sizeBytes=" + content.length + "]";
	}
}
