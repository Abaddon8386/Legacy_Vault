package com.legacyvault.beneficiary;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import org.springframework.stereotype.Component;

/**
 * Bộ sinh và băm mã mời: mã gồm 16 byte ngẫu nhiên (128 bit) mã hóa base64url không đệm (22 ký tự), chỉ lưu hash SHA-256.
 * Dùng bởi {@code BeneficiaryInvitationService} và {@code InvitationRedeemService}.
 */
@Component
public class InvitationTokens {
    private final SecureRandom random = new SecureRandom();

    /**
     * @return mã mời mới (22 ký tự base64url) sinh bằng {@code SecureRandom}.
     */
    public String generate() {
        byte[] bytes = new byte[16];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /**
     * Kiểm tra mã đúng định dạng chuẩn 22 ký tự base64url và giải mã/mã hóa lại ra cùng chuỗi (chặn các cách viết khác nhau của cùng một bí mật).
     */
    public boolean validFormat(String code) {
        // Canonical base64url prevents alternative spellings of the same 128-bit secret.
        if (code == null || !code.matches("[A-Za-z0-9_-]{22}")) return false;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(Base64.getUrlDecoder().decode(code)).equals(code);
    }

    /**
     * @return hash SHA-256 dạng hex (64 ký tự) của mã.
     */
    public String hash(String code) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(code.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 unavailable", impossible);
        }
    }
}
