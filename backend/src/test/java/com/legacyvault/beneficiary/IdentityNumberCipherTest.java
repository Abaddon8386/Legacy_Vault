package com.legacyvault.beneficiary;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.legacyvault.common.crypto.EncryptedData;
import com.legacyvault.common.crypto.EncryptionService;

class IdentityNumberCipherTest {
    private final EncryptionService encryption = new EncryptionService(
            Base64.getEncoder().encodeToString(new byte[32]), "v2");
    private final IdentityNumberCipher cipher = new IdentityNumberCipher(encryption);

    @Test
    void storesKeyVersionAndBindsCiphertextToBeneficiary() {
        UUID beneficiaryId = UUID.randomUUID();
        String value = "012345678901";
        byte[] first = cipher.encrypt(value, beneficiaryId);
        byte[] second = cipher.encrypt(value, beneficiaryId);
        assertNotEquals(java.util.Arrays.toString(first), java.util.Arrays.toString(second));
        assertFalse(new String(first, StandardCharsets.ISO_8859_1).contains(value));

        ByteBuffer bytes = ByteBuffer.wrap(first);
        byte[] magic = new byte[4];
        bytes.get(magic);
        assertEquals("LVBI", new String(magic, StandardCharsets.US_ASCII));
        assertEquals(1, Byte.toUnsignedInt(bytes.get()));
        int versionLength = Byte.toUnsignedInt(bytes.get());
        byte[] version = new byte[versionLength];
        bytes.get(version);
        assertEquals("v2", new String(version, StandardCharsets.UTF_8));
        byte[] iv = new byte[12];
        bytes.get(iv);
        byte[] ciphertext = new byte[bytes.remaining()];
        bytes.get(ciphertext);
        EncryptedData data = new EncryptedData(ciphertext, iv, "v2");
        assertEquals(value, encryption.decrypt(data, IdentityNumberCipher.associatedData(beneficiaryId)));
        assertThrows(IllegalStateException.class, () -> encryption.decrypt(data,
                IdentityNumberCipher.associatedData(UUID.randomUUID())));
    }
}
