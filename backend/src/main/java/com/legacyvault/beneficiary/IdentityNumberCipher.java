package com.legacyvault.beneficiary;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.springframework.stereotype.Component;

import com.legacyvault.common.crypto.EncryptedData;
import com.legacyvault.common.crypto.EncryptionService;

/** Stores identity ciphertext, IV and key version in the existing VARBINARY column. */
@Component
public class IdentityNumberCipher {
    private static final byte[] MAGIC = { 'L', 'V', 'B', 'I' };
    private static final byte FORMAT_VERSION = 1;
    private static final int MAX_STORED_BYTES = 512;
    private final EncryptionService encryption;

    public IdentityNumberCipher(EncryptionService encryption) {
        this.encryption = encryption;
    }

    public byte[] encrypt(String identityNumber, UUID beneficiaryId) {
        if (beneficiaryId == null) throw new IllegalArgumentException("Beneficiary ID is required");
        EncryptedData data = encryption.encrypt(identityNumber, associatedData(beneficiaryId));
        byte[] version = data.keyVersion().getBytes(StandardCharsets.UTF_8);
        if (version.length == 0 || version.length > 255 || data.iv().length != 12) {
            throw new IllegalStateException("Invalid identity encryption metadata");
        }
        int size = MAGIC.length + 1 + 1 + version.length + data.iv().length + data.ciphertext().length;
        if (size > MAX_STORED_BYTES) {
            throw new IllegalArgumentException("Encrypted identity number exceeds database column size");
        }
        return ByteBuffer.allocate(size).put(MAGIC).put(FORMAT_VERSION).put((byte) version.length)
                .put(version).put(data.iv()).put(data.ciphertext()).array();
    }

    static byte[] associatedData(UUID beneficiaryId) {
        return ("BENEFICIARY_IDENTITY_NUMBER:" + beneficiaryId).getBytes(StandardCharsets.UTF_8);
    }
}
