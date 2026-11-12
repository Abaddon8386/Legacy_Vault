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
 * Mã hóa/giải mã AES-256-GCM phía server cho payload tài sản, di chúc và file (ST-02, ST-03). Được
 * các service tài sản, di chúc, người thụ hưởng, bàn giao gọi trước khi ghi DB và sau khi đọc DB.
 *
 * <p>Mỗi lần mã hóa tạo IV ngẫu nhiên 12 byte, thẻ xác thực 128 bit. Khóa nạp từ cấu hình
 * {@code legacyvault.encryption.key} (biến môi trường {@code LEGACYVAULT_ENCRYPTION_KEY}); thiếu hoặc sai định dạng
 * thì ứng dụng không khởi động. Phiên bản khóa lấy từ {@code legacyvault.encryption.key-version} (mặc định
 * {@code v1}).
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

	/**
	 * Khởi tạo service, phân tích khóa base64.
	 *
	 * @param base64Key  khóa AES-256 dạng base64 (32 byte)
	 * @param keyVersion nhãn phiên bản khóa gắn vào {@link EncryptedData}
	 * @throws IllegalStateException nếu khóa thiếu, không phải base64 hoặc không đủ 32 byte
	 */
	public EncryptionService(@Value("${legacyvault.encryption.key:}") String base64Key,
			@Value("${legacyvault.encryption.key-version:v1}") String keyVersion) {
		this.key = parseKey(base64Key);
		this.keyVersion = keyVersion;
	}

	/**
	 * Mã hóa chuỗi văn bản (UTF-8), ví dụ payload JSON của tài sản.
	 *
	 * @param plaintext      văn bản gốc
	 * @param associatedData dữ liệu xác thực kèm theo (AAD), bắt buộc khớp khi giải mã
	 * @return {@link EncryptedData} gồm ciphertext, IV và phiên bản khóa
	 */
	public EncryptedData encrypt(String plaintext, byte[] associatedData) {
		return encrypt(plaintext.getBytes(StandardCharsets.UTF_8), associatedData);
	}

	/**
	 * Mã hóa dữ liệu nhị phân (ví dụ nội dung file di chúc, PS-17) bằng AES-GCM với IV ngẫu nhiên.
	 *
	 * @param plaintext      dữ liệu gốc
	 * @param associatedData AAD gắn ciphertext với đúng bản ghi
	 * @return {@link EncryptedData}
	 * @throws IllegalStateException nếu thao tác mã hóa thất bại
	 */
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
	 * Giải mã thành chuỗi UTF-8 (gọi {@link #decryptBytes}). Chỉ dùng nội bộ (kiểm thử, và các luồng sau này đã được
	 * Legal duyệt — LV-LEG-001); chưa có API giải mã công khai.
	 * Sai khóa, sai associatedData hoặc dữ liệu bị sửa đều ném lỗi (GCM xác thực toàn vẹn).
	 *
	 * @param data           dữ liệu đã mã hóa
	 * @param associatedData AAD đã dùng khi mã hóa
	 * @return văn bản gốc
	 * @throws IllegalStateException nếu phiên bản khóa không khớp hoặc giải mã/xác thực thất bại
	 */
	public String decrypt(EncryptedData data, byte[] associatedData) {
		return new String(decryptBytes(data, associatedData), StandardCharsets.UTF_8);
	}

	/**
	 * Giải mã thành mảng byte. Kiểm tra {@code keyVersion} trùng phiên bản khóa hiện hành rồi giải mã AES-GCM.
	 *
	 * @param data           dữ liệu đã mã hóa
	 * @param associatedData AAD đã dùng khi mã hóa
	 * @return dữ liệu gốc dạng byte
	 * @throws IllegalStateException nếu phiên bản khóa lạ hoặc giải mã/xác thực thất bại
	 */
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

	/**
	 * Giải mã base64 và kiểm tra độ dài 32 byte để tạo khóa AES.
	 *
	 * @throws IllegalStateException nếu khóa trống, không phải base64 hoặc sai độ dài
	 */
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
