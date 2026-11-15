package com.legacyvault.auth;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;

/** Xác minh chữ ký GIS ID-token, issuer Google, audience đã cấu hình, timestamp và các claim OIDC. */
@Component
public class GoogleIdTokenVerifier {
    private final JwtDecoder decoder;
    private final String clientId;

    public GoogleIdTokenVerifier(
            @Qualifier("googleIdTokenDecoder") JwtDecoder decoder,
            @Value("${legacyvault.auth.google.client-id:}") String clientId) {
        this.decoder = decoder;
        this.clientId = clientId == null ? "" : clientId.trim();
    }

    /**
     * Xác thực một Google ID token (GIS credential).
     * @param credential chuỗi JWT do Google Identity Services cấp
     * @return thông tin đã xác thực kèm hash SHA-256 của token (để chống dùng lại)
     * @throws BusinessException GOOGLE_SIGNIN_UNAVAILABLE nếu chưa cấu hình client-id hoặc không lấy được JWKS của Google; INVALID_GOOGLE_CREDENTIAL nếu token sai
     */
    public VerifiedGoogleCredential verify(String credential) {
        if (clientId.isBlank()) {
            throw new BusinessException(ErrorCode.GOOGLE_SIGNIN_UNAVAILABLE);
        }
        if (credential == null || credential.isBlank()) {
            throw invalidCredential();
        }

        final Jwt jwt;
        try {
            jwt = decoder.decode(credential);
        } catch (BadJwtException | IllegalArgumentException exception) {
            throw invalidCredential();
        } catch (JwtException exception) {
            // Lỗi JWKS/mạng của Google là sự cố vận hành, không phải bằng chứng credential sai.
            throw new BusinessException(ErrorCode.GOOGLE_SIGNIN_UNAVAILABLE);
        }

        // Ngoài chữ ký, phải khớp: issuer là Google, audience chứa client-id của hệ thống (chống token cấp cho app khác),
        // có subject, chưa hết hạn, iat không ở tương lai quá 60 giây (cho phép lệch đồng hồ) và đã qua nbf.
        Instant now = Instant.now();
        String issuer = jwt.getIssuer() == null ? null : jwt.getIssuer().toString();
        Instant expiresAt = jwt.getExpiresAt();
        Instant issuedAt = jwt.getIssuedAt();
        Instant notBefore = jwt.getNotBefore();
        String subject = jwt.getSubject();
        if (!("https://accounts.google.com".equals(issuer) || "accounts.google.com".equals(issuer))
                || !jwt.getAudience().contains(clientId)
                || subject == null || subject.isBlank()
                || expiresAt == null || !expiresAt.isAfter(now)
                || issuedAt == null || issuedAt.isAfter(now.plusSeconds(60))
                || (notBefore != null && notBefore.isAfter(now))) {
            throw invalidCredential();
        }

        return new VerifiedGoogleCredential(subject, sha256(credential), expiresAt,
                jwt.getClaimAsString("email"), isTrue(jwt.getClaim("email_verified")), jwt.getClaimAsString("name"));
    }

    /** Google gửi {@code email_verified} dạng boolean, nhưng token cũ mang chuỗi "true". */
    private static boolean isTrue(Object claim) {
        return Boolean.TRUE.equals(claim) || (claim instanceof String text && "true".equalsIgnoreCase(text));
    }

    // Chỉ lưu fingerprint SHA-256 của token (không lưu token gốc) trong bảng chống replay.
    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    private static BusinessException invalidCredential() {
        return new BusinessException(ErrorCode.INVALID_GOOGLE_CREDENTIAL);
    }

    /** {@code email}/{@code name} là null khi token không có claim đó; {@code emailVerified} mặc định false. */
    public record VerifiedGoogleCredential(String subject, String credentialHash, Instant expiresAt,
            String email, boolean emailVerified, String name) {
    }
}
