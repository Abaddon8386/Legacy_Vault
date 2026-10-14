package com.legacyvault.common.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.junit.jupiter.api.Test;

/** AES-256-GCM cho payload Asset: đúng chiều, IV ngẫu nhiên, chống sửa/chép ciphertext, cấu hình khóa bắt buộc. */
class EncryptionServiceTest {

	/** Khóa giả chỉ dùng trong test (32 byte 0x01..0x20), không phải khóa thật. */
	static final String TEST_KEY = Base64.getEncoder().encodeToString(sequence(32));

	private static final byte[] AAD = "asset-1".getBytes(StandardCharsets.UTF_8);

	private final EncryptionService service = new EncryptionService(TEST_KEY, "v1");

	@Test
	void encryptThenDecrypt_returnsOriginal() {
		EncryptedData data = service.encrypt("mật khẩu bí mật", AAD);

		assertThat(data.iv()).hasSize(12);
		assertThat(data.keyVersion()).isEqualTo("v1");
		assertThat(new String(data.ciphertext(), StandardCharsets.UTF_8)).doesNotContain("mật khẩu bí mật");
		assertThat(service.decrypt(data, AAD)).isEqualTo("mật khẩu bí mật");
	}

	@Test
	void samePlaintextTwice_givesDifferentIvAndCiphertext() {
		EncryptedData first = service.encrypt("secret", AAD);
		EncryptedData second = service.encrypt("secret", AAD);

		assertThat(first.iv()).isNotEqualTo(second.iv());
		assertThat(first.ciphertext()).isNotEqualTo(second.ciphertext());
	}

	@Test
	void ciphertextMovedToAnotherRecord_failsToDecrypt() {
		EncryptedData data = service.encrypt("secret", AAD);

		assertThatThrownBy(() -> service.decrypt(data, "asset-2".getBytes(StandardCharsets.UTF_8)))
				.isInstanceOf(IllegalStateException.class);
	}

	@Test
	void tamperedCiphertext_failsToDecrypt() {
		EncryptedData data = service.encrypt("secret", AAD);
		data.ciphertext()[0] ^= 0x01;

		assertThatThrownBy(() -> service.decrypt(data, AAD)).isInstanceOf(IllegalStateException.class);
	}

	@Test
	void toString_doesNotExposeBytes() {
		assertThat(service.encrypt("secret", AAD).toString()).doesNotContain("[B@").contains("keyVersion=v1");
	}

	@Test
	void missingKey_failsAtStartup() {
		assertThatThrownBy(() -> new EncryptionService("", "v1"))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("LEGACYVAULT_ENCRYPTION_KEY");
	}

	@Test
	void keyWithWrongLengthOrNotBase64_failsAtStartup() {
		String shortKey = Base64.getEncoder().encodeToString(sequence(16));
		assertThatThrownBy(() -> new EncryptionService(shortKey, "v1")).isInstanceOf(IllegalStateException.class);
		assertThatThrownBy(() -> new EncryptionService("not base64 !!", "v1"))
				.isInstanceOf(IllegalStateException.class);
	}

	private static byte[] sequence(int length) {
		byte[] bytes = new byte[length];
		for (int i = 0; i < length; i++) {
			bytes[i] = (byte) (i + 1);
		}
		return bytes;
	}
}
