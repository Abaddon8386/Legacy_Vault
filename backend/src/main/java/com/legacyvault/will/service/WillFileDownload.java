package com.legacyvault.will.service;

/**
 * Nội dung một phiên bản file di chúc đã giải mã, chỉ để trả cho Owner sau khi xác nhận lại mật khẩu (D-API-33).
 * {@code toString} không in nội dung.
 */
public record WillFileDownload(byte[] content, String contentType, String fileName, String sha256) {

	@Override
	public String toString() {
		return "WillFileDownload[contentType=" + contentType + ", sizeBytes=" + content.length + "]";
	}
}
