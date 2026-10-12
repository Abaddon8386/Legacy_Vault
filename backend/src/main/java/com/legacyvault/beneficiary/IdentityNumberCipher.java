package com.legacyvault.beneficiary;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** AES-GCM encryption for write-only identity numbers. The key is supplied outside source control. */
@Component
public class IdentityNumberCipher {

	private static final int NONCE_BYTES = 12;
	private static final int TAG_BITS = 128;
	private static final SecureRandom RANDOM = new SecureRandom();
	private final String base64Key;

	public IdentityNumberCipher(@Value("${legacyvault.beneficiary.identity-encryption-key:}") String base64Key) {
		this.base64Key = base64Key;
	}

	public byte[] encrypt(String identityNumber) {
		byte[] key = decodeKey();
		byte[] nonce = new byte[NONCE_BYTES];
		RANDOM.nextBytes(nonce);
		try {
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(TAG_BITS, nonce));
			byte[] encrypted = cipher.doFinal(identityNumber.getBytes(java.nio.charset.StandardCharsets.UTF_8));
			return ByteBuffer.allocate(nonce.length + encrypted.length).put(nonce).put(encrypted).array();
		} catch (GeneralSecurityException ex) {
			throw new IllegalStateException("Could not encrypt beneficiary identity number", ex);
		}
	}

	private byte[] decodeKey() {
		if (base64Key == null || base64Key.isBlank()) {
			throw new IllegalStateException("Beneficiary identity encryption key is not configured");
		}
		try {
			byte[] key = Base64.getDecoder().decode(base64Key);
			if (key.length != 16 && key.length != 24 && key.length != 32) {
				throw new IllegalStateException("Beneficiary identity encryption key must be 16, 24 or 32 bytes");
			}
			return key;
		} catch (IllegalArgumentException ex) {
			throw new IllegalStateException("Beneficiary identity encryption key is not valid base64", ex);
		}
	}
}
