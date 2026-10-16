package com.legacyvault.common.crypto;

/**
 * Kết quả mã hóa: ciphertext (đã gồm GCM tag), IV 12 byte và phiên bản khóa đã dùng.
 * Không chứa khóa bí mật. Lưu cả ba vào DB để giải mã đúng khóa khi có xoay khóa.
 */
public record EncryptedData(byte[] ciphertext, byte[] iv, String keyVersion) {

	/** Không in byte ra log nếu record bị log nhầm. */
	@Override
	public String toString() {
		return "EncryptedData[keyVersion=" + keyVersion + ", ciphertextLength=" + ciphertext.length + "]";
	}
}
