package com.legacyvault.asset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import com.legacyvault.asset.service.AssetDocumentFile;
import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

/** PS-114 (D-API-43): documents are accepted by content only; macros and other containers are rejected. */
class AssetDocumentFileTest {
	private static final long MAX = 10 * 1024 * 1024;
	private static final byte[] OLE2 = { (byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1 };

	private static MockMultipartFile upload(String name, String declared, byte[] bytes) {
		return new MockMultipartFile("documents", name, declared, bytes);
	}

	private static ErrorCode rejection(MockMultipartFile file) {
		return assertThrows(BusinessException.class, () -> AssetDocumentFile.inspect(file, MAX)).getErrorCode();
	}

	private static byte[] zip(String... names) throws Exception {
		var out = new ByteArrayOutputStream();
		try (var zip = new ZipOutputStream(out)) {
			for (String name : names) {
				zip.putNextEntry(new ZipEntry(name));
				zip.write("<x/>".getBytes(StandardCharsets.UTF_8));
				zip.closeEntry();
			}
		}
		return out.toByteArray();
	}

	private static byte[] ole2(String... utf16Names) {
		var out = new ByteArrayOutputStream();
		out.writeBytes(OLE2);
		out.writeBytes(new byte[512]);
		for (String name : utf16Names) {
			out.writeBytes(name.getBytes(StandardCharsets.UTF_16LE));
			out.writeBytes(new byte[64]);
		}
		return out.toByteArray();
	}

	@Test
	void acceptsPdfDocxAndPlainWordDocByContent() throws Exception {
		var pdf = AssetDocumentFile.inspect(upload("hop-dong.pdf", "application/pdf", "%PDF-1.7\nbody\n%%EOF".getBytes(StandardCharsets.UTF_8)), MAX);
		assertEquals(AssetDocumentFile.PDF, pdf.contentType());
		assertEquals(64, pdf.sha256().length());

		var docx = AssetDocumentFile.inspect(upload("a.docx", AssetDocumentFile.DOCX, zip("[Content_Types].xml", "word/document.xml", "_rels/.rels")), MAX);
		assertEquals(AssetDocumentFile.DOCX, docx.contentType());

		var doc = AssetDocumentFile.inspect(upload("a.doc", "application/msword", ole2("WordDocument", "1Table")), MAX);
		assertEquals(AssetDocumentFile.DOC, doc.contentType());
	}

	@Test
	void theDeclaredTypeAndFileNameNeverDecideTheType() throws Exception {
		byte[] pdf = "%PDF-1.4\n%%EOF".getBytes(StandardCharsets.UTF_8);
		assertEquals(ErrorCode.UNSUPPORTED_MEDIA_TYPE, rejection(upload("x.docx", AssetDocumentFile.DOCX, pdf)));
		assertEquals(ErrorCode.UNSUPPORTED_MEDIA_TYPE, rejection(upload("x.pdf", "image/png", pdf)));
		assertEquals(AssetDocumentFile.PDF, AssetDocumentFile.inspect(upload("x.txt", "application/octet-stream", pdf), MAX).contentType());
		assertEquals(AssetDocumentFile.PDF, AssetDocumentFile.inspect(upload("x.bin", null, pdf), MAX).contentType());
		assertEquals(ErrorCode.UNSUPPORTED_MEDIA_TYPE, rejection(upload("evil.pdf", "application/pdf", "plain text".getBytes(StandardCharsets.UTF_8))));
	}

	@Test
	void macroEnabledAndForeignContainersAreRejected() throws Exception {
		assertEquals(ErrorCode.UNSUPPORTED_MEDIA_TYPE, rejection(upload("m.docm", AssetDocumentFile.DOCX, zip("[Content_Types].xml", "word/document.xml", "word/vbaProject.bin"))));
		assertEquals(ErrorCode.UNSUPPORTED_MEDIA_TYPE, rejection(upload("x.xlsx", AssetDocumentFile.DOCX, zip("[Content_Types].xml", "xl/workbook.xml"))));
		assertEquals(ErrorCode.UNSUPPORTED_MEDIA_TYPE, rejection(upload("plain.zip", "application/zip", zip("a.txt"))));
		assertEquals(ErrorCode.UNSUPPORTED_MEDIA_TYPE, rejection(upload("slip.docx", AssetDocumentFile.DOCX, zip("[Content_Types].xml", "word/document.xml", "../evil.txt"))));
		assertEquals(ErrorCode.UNSUPPORTED_MEDIA_TYPE, rejection(upload("macro.doc", "application/msword", ole2("WordDocument", "_VBA_PROJECT_CUR"))));
		assertEquals(ErrorCode.UNSUPPORTED_MEDIA_TYPE, rejection(upload("sheet.xls", "application/msword", ole2("Workbook"))));
		assertEquals(ErrorCode.UNSUPPORTED_MEDIA_TYPE, rejection(upload("truncated.docx", AssetDocumentFile.DOCX, new byte[] { 'P', 'K', 3, 4, 1, 2, 3 })));
	}

	@Test
	void emptyAndOversizedFilesAreRejectedBeforeAnyParsing() {
		assertEquals(ErrorCode.VALIDATION_FAILED, rejection(upload("e.pdf", "application/pdf", new byte[0])));
		var big = upload("big.pdf", "application/pdf", new byte[(int) MAX + 1]);
		assertEquals(ErrorCode.PAYLOAD_TOO_LARGE, assertThrows(BusinessException.class, () -> AssetDocumentFile.inspect(big, MAX)).getErrorCode());
		assertEquals(ErrorCode.VALIDATION_FAILED, assertThrows(BusinessException.class, () -> AssetDocumentFile.inspect(null, MAX)).getErrorCode());
	}

	@Test
	void fileNameIsSanitizedAndToStringHidesContent() throws Exception {
		var file = AssetDocumentFile.inspect(upload("..\\..\\etc/passwd\u0007.pdf", "application/pdf", "%PDF-1.4\nSECRET-BODY".getBytes(StandardCharsets.UTF_8)), MAX);
		assertEquals("passwd.pdf", file.fileName());
		assertFalse(file.toString().contains("SECRET-BODY"));
	}
}
