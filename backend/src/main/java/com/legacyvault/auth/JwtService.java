package com.legacyvault.auth;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;

/**
 * Sinh và xác thực access token JWT (ký HMAC bằng khóa base64 từ cấu hình {@code legacyvault.jwt.secret}).
 * Token chứa subject = publicId, email, roles và {@code authVersion}; {@code JwtAuthenticationFilter} so authVersion với DB để vô hiệu hóa token cũ.
 */
@Service
public class JwtService {

    private final SecretKey signingKey;
    private final long expirationSeconds;

    public JwtService(
            @Value("${legacyvault.jwt.secret}") String secret,
            @Value("${legacyvault.jwt.expiration-seconds}") long expirationSeconds) {

        if (expirationSeconds <= 0) {
            throw new IllegalArgumentException("JWT expiration must be greater than zero");
        }

        byte[] keyBytes = Decoders.BASE64.decode(secret);
        this.signingKey = Keys.hmacShaKeyFor(keyBytes);
        this.expirationSeconds = expirationSeconds;
    }

    /** Sinh token với authVersion = 0. */
    public String generateAccessToken(UUID publicUserId, String email, List<String> roles) {
        return generateAccessToken(publicUserId, email, roles, 0);
    }

    /**
     * Sinh access token đã ký.
     * @param publicUserId id công khai của người dùng (subject)
     * @param roles mã role dạng {@code ROLE_*} dùng cho phân quyền
     * @param authVersion phải khớp {@code users.auth_version}; tăng giá trị này sẽ thu hồi mọi token cũ
     * @throws IllegalArgumentException nếu authVersion âm
     */
    public String generateAccessToken(UUID publicUserId, String email, List<String> roles, long authVersion) {
        if (authVersion < 0) throw new IllegalArgumentException("Invalid auth version");
        Instant now = Instant.now();
        Instant expiration = now.plusSeconds(expirationSeconds);

        return Jwts.builder()
                .subject(publicUserId.toString())
                .claim("email", email)
                .claim("roles", roles)
                .claim("authVersion", authVersion)
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiration))
                .signWith(signingKey)
                .compact();
    }

    /** Kiểm tra chữ ký và hạn của token, trả về claims. Ném exception của jjwt nếu token sai hoặc hết hạn. */
    public Claims parseAndValidate(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public long getExpirationSeconds() {
        return expirationSeconds;
    }
}
