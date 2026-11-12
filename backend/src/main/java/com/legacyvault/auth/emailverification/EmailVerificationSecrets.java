package com.legacyvault.auth.emailverification;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import com.legacyvault.auth.recovery.RecoverySecrets;
import org.springframework.stereotype.Component;

/**
 * Tái sử dụng bộ sinh mã, kiểm tra định dạng và bucket HMAC của {@link com.legacyvault.auth.recovery.RecoverySecrets}; chỉ khác miền băm
 * ({@code EMAIL_VERIFICATION:}) để mã của hai mục đích không bao giờ dùng lẫn nhau.
 */
@Component
public class EmailVerificationSecrets {
    /**
     * Bộ bí mật dùng chung.
     */
    private final RecoverySecrets secrets;
    /**
     * @param secrets bộ bí mật của khôi phục mật khẩu
     */
    public EmailVerificationSecrets(RecoverySecrets secrets) { this.secrets = secrets; }

    /**
     * Sinh mã xác minh ngẫu nhiên (Base64 URL-safe, 43 ký tự).
     */
    public String generate() { return secrets.generate(); }
    /**
     * Kiểm tra định dạng mã.
     */
    public boolean valid(String value) { return secrets.valid(value); }
    /**
     * Dấu vân tay HMAC của email đã chuẩn hóa, gắn vào mã để mã mất hiệu lực khi đổi email.
     *
     * @param normalizedEmail email đã chuẩn hóa
     * @return dấu vân tay hex
     */
    public String emailFingerprint(String normalizedEmail) { return secrets.bucket("verify-email", normalizedEmail); }
    /**
     * Băm SHA-256 (hex) có tiền tố {@code EMAIL_VERIFICATION:}; chỉ lưu giá trị này trong DB.
     *
     * @param value mã thô
     * @return băm hex
     */
    public String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(("EMAIL_VERIFICATION:" + value).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
}
