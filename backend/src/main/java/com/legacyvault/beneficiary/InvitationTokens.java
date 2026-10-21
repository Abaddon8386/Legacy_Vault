package com.legacyvault.beneficiary;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import org.springframework.stereotype.Component;

@Component
public class InvitationTokens {
    private final SecureRandom random = new SecureRandom();

    public String generate() {
        byte[] bytes = new byte[16];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public boolean validFormat(String code) {
        // Canonical base64url prevents alternative spellings of the same 128-bit secret.
        if (code == null || !code.matches("[A-Za-z0-9_-]{22}")) return false;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(Base64.getUrlDecoder().decode(code)).equals(code);
    }

    public String hash(String code) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(code.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 unavailable", impossible);
        }
    }
}
