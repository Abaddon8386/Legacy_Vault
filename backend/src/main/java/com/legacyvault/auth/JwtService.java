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
 * Dịch vụ tạo và kiểm tra JWT truy cập (HS256) của hệ thống. Khóa ký lấy từ
 * {@code legacyvault.jwt.secret} (Base64) và thời hạn từ {@code legacyvault.jwt.expiration-seconds}.
 * Được {@code AuthService}/{@code GoogleAuthService} dùng để cấp token khi đăng nhập và
 * {@code JwtAuthenticationFilter} dùng để kiểm tra mỗi request. Claim gồm: subject = publicId, {@code email},
 * {@code roles}, {@code authVersion} (phải khớp {@code users.auth_version} khi xác thực).
 */
@Service
public class JwtService {

    /**
     * Khóa HMAC dùng để ký và kiểm tra token.
     */
    private final SecretKey signingKey;
    /**
     * Thời gian sống của access token, tính bằng giây (luôn lớn hơn 0).
     */
    private final long expirationSeconds;

    /**
     * Khởi tạo dịch vụ từ cấu hình.
     *
     * @param secret            khóa bí mật mã hóa Base64
     * @param expirationSeconds thời hạn token (giây)
     * @throws IllegalArgumentException nếu thời hạn không dương
     */
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

    /**
     * Tạo access token với {@code authVersion = 0}.
     *
     * @param publicUserId publicId của người dùng
     * @param email        email của người dùng
     * @param roles        danh sách role (dạng {@code ROLE_*})
     * @return chuỗi JWT đã ký
     */
    public String generateAccessToken(UUID publicUserId, String email, List<String> roles) {
        return generateAccessToken(publicUserId, email, roles, 0);
    }

    /**
     * Tạo access token có kèm {@code authVersion}; khi tăng {@code users.auth_version} (đổi mật khẩu, v.v.) các token
     * cũ sẽ mất hiệu lực.
     *
     * @param publicUserId publicId của người dùng (subject)
     * @param email        email của người dùng
     * @param roles        danh sách role (dạng {@code ROLE_*})
     * @param authVersion  phiên bản xác thực hiện tại của tài khoản
     * @return chuỗi JWT đã ký
     * @throws IllegalArgumentException nếu {@code authVersion} âm
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

    /**
     * Kiểm tra chữ ký và hạn dùng rồi trả về claims của token.
     *
     * @param token chuỗi JWT
     * @return payload claims
     * @throws io.jsonwebtoken.JwtException nếu token sai chữ ký, hết hạn hoặc không đúng định dạng
     */
    public Claims parseAndValidate(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    /**
     * Trả về thời hạn access token (giây), dùng cho trường {@code expiresInSeconds} của phản hồi đăng nhập.
     */
    public long getExpirationSeconds() {
        return expirationSeconds;
    }
}
