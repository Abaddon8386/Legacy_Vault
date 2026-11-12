package com.legacyvault.common.crypto;

/**
 * Kết quả mã hóa của {@link EncryptionService}, được lưu vào DB (cột ciphertext, iv, key_version của tài sản,
 * di chúc, file...).
 *
 * <ul>
 *   <li>{@code ciphertext}: bản mã kèm tag xác thực GCM;</li>
 *   <li>{@code iv}: vector khởi tạo 12 byte ngẫu nhiên cho mỗi lần mã hóa;</li>
 *   <li>{@code keyVersion}: phiên bản khóa đã dùng để hỗ trợ xoay khóa.</li>
 * </ul>
 *
 * <p>Kết quả mã hóa: ciphertext (đã gồm GCM tag), IV 12 byte và phiên bản khóa đã dùng.
 * Không chứa khóa bí mật. Lưu cả ba vào DB để giải mã đúng khóa khi có xoay khóa.
 */
public record EncryptedData(byte[] ciphertext, byte[] iv, String keyVersion) {

	/** Chỉ in phiên bản khóa và độ dài ciphertext; không in nội dung byte ra log nếu record bị log nhầm. */
	@Override
	public String toString() {
		return "EncryptedData[keyVersion=" + keyVersion + ", ciphertextLength=" + ciphertext.length + "]";
	}
}
