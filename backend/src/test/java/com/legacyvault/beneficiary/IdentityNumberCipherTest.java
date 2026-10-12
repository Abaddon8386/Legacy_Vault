package com.legacyvault.beneficiary;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.junit.jupiter.api.Test;

class IdentityNumberCipherTest {

	@Test
	void encryptsSameIdentityWithDifferentNoncesAndDoesNotStorePlaintext() {
		String key = Base64.getEncoder().encodeToString(new byte[32]);
		IdentityNumberCipher cipher = new IdentityNumberCipher(key);
		String value = "012345678901";
		byte[] first = cipher.encrypt(value);
		byte[] second = cipher.encrypt(value);

		assertNotEquals(java.util.Arrays.toString(first), java.util.Arrays.toString(second));
		assertFalse(new String(first, StandardCharsets.ISO_8859_1).contains(value));
	}

	@Test
	void requiresAnExternalEncryptionKey() {
		IdentityNumberCipher cipher = new IdentityNumberCipher("");
		assertThrows(IllegalStateException.class, () -> cipher.encrypt("012345678901"));
	}
}
