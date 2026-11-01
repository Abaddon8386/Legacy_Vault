package com.legacyvault.auth.emailverification;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import com.legacyvault.auth.recovery.RecoverySecrets;
import org.springframework.stereotype.Component;

/** Reuses the recovery generator/format check/HMAC buckets; only the hash domain differs so credentials never cross purposes. */
@Component
public class EmailVerificationSecrets {
    private final RecoverySecrets secrets;
    public EmailVerificationSecrets(RecoverySecrets secrets) { this.secrets = secrets; }

    public String generate() { return secrets.generate(); }
    public boolean valid(String value) { return secrets.valid(value); }
    public String emailFingerprint(String normalizedEmail) { return secrets.bucket("verify-email", normalizedEmail); }
    public String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(("EMAIL_VERIFICATION:" + value).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
}
