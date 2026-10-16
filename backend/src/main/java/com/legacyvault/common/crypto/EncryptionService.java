package com.legacyvault.common.crypto;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Mã hóa đối xứng phía server cho payload tài sản và file di chúc (ST-02, ST-03): AES-256-GCM,
 * IV ngẫu nhiên 12 byte mỗi lần mã hóa.
 *
 * <p>Khóa lấy từ {@code legacyvault.encryption.key} (base64 của 32 byte, cấp qua biến môi trường
 * {@code LEGACYVAULT_ENCRYPTION_KEY}). Không có giá trị mặc định: thiếu hoặc sai khóa thì ứng dụng không khởi động,
 * tránh âm thầm mã hóa bằng một khóa ai cũng biết. Không log khóa, plaintext hay ciphertext.
 *
 * <p>{@code associatedData} gắn ciphertext với đúng bản ghi (ví dụ UUID của Asset): chép ciphertext sang bản ghi khác
 * sẽ giải mã thất bại.
 */
@Service
public class EncryptionService {

	private static final String TRANSFORMATION = "AES/GCM/NoPadding";
	private static final int KEY_BYTES = 32;
	private static final int IV_BYTES = 12;
	private static final int TAG_BITS = 128;

	private final SecretKey key;
	private final String keyVersion;
	private final SecureRandom random = new SecureRandom();

	public EncryptionService(@Value("${legacyvault.encryption.key:}") String base64Key,
			@Value("${legacyvault.encryption.key-version:v1}") String keyVersion) {
		this.key = parseKey(base64Key);
		this.keyVersion = keyVersion;
	}

	public EncryptedData encrypt(String plaintext, byte[] associatedData) {
		return encrypt(plaintext.getBytes(StandardCharsets.UTF_8), associatedData);
	}

	/** Mã hóa dữ liệu nhị phân (vd nội dung file di chúc — PS-17). */
	public EncryptedData encrypt(byte[] plaintext, byte[] associatedData) {
		byte[] iv = new byte[IV_BYTES];
		random.nextBytes(iv);
		try {
			Cipher cipher = Cipher.getInstance(TRANSFORMATION);
			cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
			cipher.updateAAD(associatedData);
			return new EncryptedData(cipher.doFinal(plaintext), iv, keyVersion);
		}
		catch (GeneralSecurityException ex) {
			throw new IllegalStateException("Encryption failed", ex);
		}
	}

	/**
	 * Chỉ dùng nội bộ (kiểm thử, và các luồng sau này đã được Legal duyệt — LV-LEG-001). Sprint 1 không có API giải mã.
	 * Sai khóa, sai associatedData hoặc dữ liệu bị sửa đều ném lỗi (GCM xác thực toàn vẹn).
	 */
	public String decrypt(EncryptedData data, byte[] associatedData) {
		return new String(decryptBytes(data, associatedData), StandardCharsets.UTF_8);
	}

	public byte[] decryptBytes(EncryptedData data, byte[] associatedData) {
		if (!keyVersion.equals(data.keyVersion())) {
			throw new IllegalStateException("Unknown encryption key version");
		}
		try {
			Cipher cipher = Cipher.getInstance(TRANSFORMATION);
			cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, data.iv()));
			cipher.updateAAD(associatedData);
			return cipher.doFinal(data.ciphertext());
		}
		catch (GeneralSecurityException ex) {
			throw new IllegalStateException("Decryption failed", ex);
		}
	}

	private static SecretKey parseKey(String base64Key) {
		if (base64Key == null || base64Key.isBlank()) {
			throw new IllegalStateException(
					"legacyvault.encryption.key is not set (environment variable LEGACYVAULT_ENCRYPTION_KEY)");
		}
		byte[] bytes;
		try {
			bytes = Base64.getDecoder().decode(base64Key.trim());
		}
		catch (IllegalArgumentException ex) {
			throw new IllegalStateException("legacyvault.encryption.key must be base64");
		}
		if (bytes.length != KEY_BYTES) {
			throw new IllegalStateException("legacyvault.encryption.key must decode to 32 bytes (AES-256)");
		}
		return new SecretKeySpec(bytes, "AES");
	}
}
