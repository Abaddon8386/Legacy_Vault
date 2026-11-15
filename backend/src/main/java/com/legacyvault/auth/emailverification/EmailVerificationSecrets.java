package com.legacyvault.auth.emailverification;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import com.legacyvault.auth.recovery.RecoverySecrets;
import org.springframework.stereotype.Component;

/** Tái dùng bộ sinh/kiểm tra định dạng/HMAC bucket của luồng khôi phục; chỉ khác miền băm để credential không bị dùng lẫn mục đích. */
@Component
public class EmailVerificationSecrets {
    private final RecoverySecrets secrets;
    public EmailVerificationSecrets(RecoverySecrets secrets) { this.secrets = secrets; }

    public String generate() { return secrets.generate(); }
    public boolean valid(String value) { return secrets.valid(value); }
    // Fingerprint của email dùng để ràng buộc job/credential với đúng địa chỉ email lúc yêu cầu; đổi email thì fingerprint đổi và credential cũ vô hiệu.
    public String emailFingerprint(String normalizedEmail) { return secrets.bucket("verify-email", normalizedEmail); }
    // Tiền tố "EMAIL_VERIFICATION:" tách miền băm, để credential của luồng này không dùng được ở luồng khác (ví dụ khôi phục mật khẩu). DB chỉ lưu hash.
    public String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(("EMAIL_VERIFICATION:" + value).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
}
