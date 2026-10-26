package com.legacyvault.auth.recovery;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class RecoverySecrets {
    private final SecureRandom random = new SecureRandom();
    private final byte[] rateKey;
    public RecoverySecrets(@Value("${legacyvault.jwt.secret}") String secret) {
        // Derive a separate HMAC key; do not reuse the JWT signing key directly for counters.
        try {
            Mac derive=Mac.getInstance("HmacSHA256");
            derive.init(new SecretKeySpec(Base64.getDecoder().decode(secret),"HmacSHA256"));
            rateKey=derive.doFinal("LEGACYVAULT/RECOVERY_LIMIT/v1".getBytes(StandardCharsets.US_ASCII));
        } catch(java.security.GeneralSecurityException e) { throw new IllegalStateException("HMAC unavailable"); }
    }
    public String generate() {
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    public boolean valid(String value) {
        return value != null && value.matches("[A-Za-z0-9_-]{43}")
                && Base64.getUrlEncoder().withoutPadding().encodeToString(Base64.getUrlDecoder().decode(value)).equals(value);
    }
    public String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(("PASSWORD_RESET:" + value).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
    public String bucket(String scope, String value) {
        try {
            Mac mac=Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(rateKey,"HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(("RECOVERY_LIMIT:"+scope+":"+value).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) { throw new IllegalStateException("HMAC unavailable"); }
    }
}
