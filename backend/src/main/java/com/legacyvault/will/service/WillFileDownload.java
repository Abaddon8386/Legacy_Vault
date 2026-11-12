package com.legacyvault.will.service;

/**
 * Nội dung một phiên bản file di chúc đã giải mã, chỉ để trả cho Owner sau khi xác nhận lại mật khẩu (D-API-33).
 * {@code toString} không in nội dung.
 *
 * <ul>
 * <li>{@code content} - byte giải mã</li>
 * <li>{@code contentType} - MIME</li>
 * <li>{@code fileName} - tên file gốc</li>
 * <li>{@code sha256} - băm đã lưu và đã đối chiếu</li>
 * </ul>
 */
public record WillFileDownload(byte[] content, String contentType, String fileName, String sha256) {

	/**
	 * Chỉ in loại và kích thước.
	 */
	@Override
	public String toString() {
		return "WillFileDownload[contentType=" + contentType + ", sizeBytes=" + content.length + "]";
	}
}
