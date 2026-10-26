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

    public String generateAccessToken(UUID publicUserId, String email, List<String> roles) {
        return generateAccessToken(publicUserId, email, roles, 0);
    }

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
