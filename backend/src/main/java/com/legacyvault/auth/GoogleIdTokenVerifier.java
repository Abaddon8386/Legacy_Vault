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

/**
 * Xác minh ID token của Google Identity Services: chữ ký (qua {@code googleIdTokenDecoder}), issuer là Google,
 * audience đúng client-id cấu hình ({@code legacyvault.auth.google.client-id}), các mốc thời gian và claim OIDC.
 * Được {@link GoogleAuthService} sử dụng.
 */
@Component
public class GoogleIdTokenVerifier {
    /**
     * Decoder JWT kiểm tra chữ ký bằng JWKS của Google.
     */
    private final JwtDecoder decoder;
    /**
     * Google OAuth client-id mà audience của token phải chứa; rỗng nghĩa là chưa cấu hình.
     */
    private final String clientId;

    /**
     * @param decoder  decoder JWT của Google
     * @param clientId client-id Google đã cấu hình (có thể rỗng)
     */
    public GoogleIdTokenVerifier(
            @Qualifier("googleIdTokenDecoder") JwtDecoder decoder,
            @Value("${legacyvault.auth.google.client-id:}") String clientId) {
        this.decoder = decoder;
        this.clientId = clientId == null ? "" : clientId.trim();
    }

    /**
     * Xác minh một credential. Lỗi định dạng/chữ ký là credential không hợp lệ; lỗi mạng/JWKS là dịch vụ không khả dụng.
     *
     * @param credential chuỗi ID token
     * @return thông tin đã xác minh (subject, băm SHA-256, hạn, email, trạng thái xác minh email, tên)
     * @throws BusinessException {@code GOOGLE_SIGNIN_UNAVAILABLE} nếu chưa cấu hình client-id hoặc Google không truy cập được;
     *         {@code INVALID_GOOGLE_CREDENTIAL} nếu token sai
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
            // Google JWKS/network failures are operational outages, not proof of a bad credential.
            throw new BusinessException(ErrorCode.GOOGLE_SIGNIN_UNAVAILABLE);
        }

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

    /**
     * Đọc claim {@code email_verified}: Google gửi kiểu boolean nhưng token cũ dùng chuỗi "true".
     *
     * @param claim giá trị claim
     * @return {@code true} nếu email được coi là đã xác minh
     */
    private static boolean isTrue(Object claim) {
        return Boolean.TRUE.equals(claim) || (claim instanceof String text && "true".equalsIgnoreCase(text));
    }

    /**
     * Băm SHA-256 một chuỗi và trả về dạng hex.
     *
     * @param value chuỗi đầu vào
     * @return 64 ký tự hex
     */
    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    /**
     * Tạo ngoại lệ {@code INVALID_GOOGLE_CREDENTIAL}.
     */
    private static BusinessException invalidCredential() {
        return new BusinessException(ErrorCode.INVALID_GOOGLE_CREDENTIAL);
    }

    /**
     * Kết quả xác minh credential Google. {@code email}/{@code name} là {@code null} khi token không có claim tương ứng;
     * {@code emailVerified} mặc định {@code false}.
     *
     * @param subject        mã định danh người dùng ổn định của Google ({@code sub})
     * @param credentialHash SHA-256 hex của token, dùng chống replay
     * @param expiresAt      thời điểm token hết hạn
     * @param email          email trong token
     * @param emailVerified  Google đã xác minh email hay chưa
     * @param name           tên hiển thị
     */
    public record VerifiedGoogleCredential(String subject, String credentialHash, Instant expiresAt,
            String email, boolean emailVerified, String name) {
    }
}
