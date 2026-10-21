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

/** Verifies GIS ID-token signature, Google issuer, configured audience, timestamps and OIDC claims. */
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

        return new VerifiedGoogleCredential(subject, sha256(credential), expiresAt);
    }

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

    public record VerifiedGoogleCredential(String subject, String credentialHash, Instant expiresAt) {
    }
}
