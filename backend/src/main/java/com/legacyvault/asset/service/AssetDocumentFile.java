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
 * PS-114 (D-API-43): a document attached to an Asset, validated by <b>content</b> and never trusted by name or declared
 * type. Allowed: PDF, legacy Word (.doc, OLE2) and Word 2007+ (.docx). Macro-enabled files (.docm, VBA inside .doc) and
 * every other OLE2/ZIP container are rejected, so the stored bytes are always plain documents. The server never parses
 * or renders the document beyond this structural check.
 */
public record AssetDocumentFile(byte[] content, String fileName, String contentType, String sha256) {

	public static final String PDF = "application/pdf";
	public static final String DOC = "application/msword";
	public static final String DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
	public static final Set<String> TYPES = Set.of(PDF, DOC, DOCX);

	private static final Set<String> GENERIC = Set.of("application/octet-stream");
	private static final int MAX_ZIP_ENTRIES = 5_000;
	private static final long MAX_UNCOMPRESSED_BYTES = 200L * 1024 * 1024;
	private static final byte[] OLE2 = { (byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1 };
	private static final byte[] WORD_STREAM = utf16("WordDocument");
	private static final byte[] VBA_STREAM = utf16("_VBA_PROJECT");

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

	public long size() {
		return content.length;
	}

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

	/** Zip containing a Word body and no macro project; entry count and total size bounded against zip bombs. */
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

	/** OLE2 container that holds a Word stream and no VBA project (Excel/PowerPoint/MSI and macro Word are rejected). */
	private static boolean isPlainWordDoc(byte[] bytes) {
		return indexOf(bytes, WORD_STREAM) >= 0 && indexOf(bytes, VBA_STREAM) < 0;
	}

	private static boolean declaredMatches(String declared, String detected) {
		if (declared == null || declared.isBlank()) {
			return true;
		}
		String type = declared.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
		return type.equals(detected) || GENERIC.contains(type);
	}

	private static byte[] utf16(String text) {
		return text.getBytes(java.nio.charset.StandardCharsets.UTF_16LE);
	}

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

	@Override
	public String toString() {
		return "AssetDocumentFile[type=" + contentType + ", sizeBytes=" + content.length + "]";
	}
}
