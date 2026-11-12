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

/**
 * Tiện ích mật mã cho khôi phục mật khẩu: sinh mã ngẫu nhiên, băm mã để lưu, và tạo khóa bucket giới hạn tốc độ bằng HMAC.
 */
@Component
public class RecoverySecrets {
    /**
     * Nguồn ngẫu nhiên an toàn để sinh mã.
     */
    private final SecureRandom random = new SecureRandom();
    /**
     * Khóa HMAC riêng dẫn xuất từ JWT secret, chỉ dùng cho bucket giới hạn.
     */
    private final byte[] rateKey;
    /**
     * Dẫn xuất khóa HMAC riêng từ JWT secret (không dùng trực tiếp khóa ký JWT cho bộ đếm).
     *
     * @param secret JWT secret dạng Base64
     * @throws IllegalStateException nếu HMAC không khả dụng
     */
    public RecoverySecrets(@Value("${legacyvault.jwt.secret}") String secret) {
        // Derive a separate HMAC key; do not reuse the JWT signing key directly for counters.
        try {
            Mac derive=Mac.getInstance("HmacSHA256");
            derive.init(new SecretKeySpec(Base64.getDecoder().decode(secret),"HmacSHA256"));
            rateKey=derive.doFinal("LEGACYVAULT/RECOVERY_LIMIT/v1".getBytes(StandardCharsets.US_ASCII));
        } catch(java.security.GeneralSecurityException e) { throw new IllegalStateException("HMAC unavailable"); }
    }
    /**
     * Sinh mã khôi phục: 32 byte ngẫu nhiên mã hóa Base64 URL-safe không đệm (43 ký tự).
     */
    public String generate() {
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    /**
     * Kiểm tra định dạng mã: đúng 43 ký tự Base64 URL-safe và giải mã/mã hóa lại khớp chính nó.
     *
     * @param value mã cần kiểm tra
     * @return {@code true} nếu đúng định dạng
     */
    public boolean valid(String value) {
        return value != null && value.matches("[A-Za-z0-9_-]{43}")
                && Base64.getUrlEncoder().withoutPadding().encodeToString(Base64.getUrlDecoder().decode(value)).equals(value);
    }
    /**
     * Băm SHA-256 (hex) có tiền tố {@code PASSWORD_RESET:}; chỉ lưu giá trị này trong DB.
     *
     * @param value mã thô
     * @return băm hex
     */
    public String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(("PASSWORD_RESET:" + value).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
    /**
     * Tạo khóa bucket HMAC-SHA256 (hex) cho giới hạn tốc độ hoặc dấu vân tay email.
     *
     * @param scope phạm vi
     * @param value giá trị (IP, email, mã)
     * @return khóa hex
     */
    public String bucket(String scope, String value) {
        try {
            Mac mac=Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(rateKey,"HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(("RECOVERY_LIMIT:"+scope+":"+value).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) { throw new IllegalStateException("HMAC unavailable"); }
    }
}
