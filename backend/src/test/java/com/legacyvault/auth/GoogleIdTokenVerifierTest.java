package com.legacyvault.auth;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.time.Instant;
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.*;

class GoogleIdTokenVerifierTest {
    private KeyPair trustedKey;
    private KeyPair otherKey;
    private GoogleIdTokenVerifier verifier;

    @BeforeEach
    void setUp() throws Exception {
        trustedKey = rsaKeyPair();
        otherKey = rsaKeyPair();
        JwtDecoder decoder = NimbusJwtDecoder.withPublicKey((java.security.interfaces.RSAPublicKey) trustedKey.getPublic()).build();
        verifier = new GoogleIdTokenVerifier(decoder, "legacyvault-web-client");
    }

    @Test
    void verifiesGoogleSignatureAndRequiredClaims() throws Exception {
        String token = token(trustedKey, "https://accounts.google.com", "legacyvault-web-client",
                "stable-google-subject", Instant.now().plusSeconds(300));

        var verified = verifier.verify(token);

        assertEquals("stable-google-subject", verified.subject());
        assertEquals(64, verified.credentialHash().length());
        assertTrue(verified.expiresAt().isAfter(Instant.now()));
    }

    @Test
    void rejectsSignatureFromUntrustedKey() throws Exception {
        assertInvalid(token(otherKey, "https://accounts.google.com", "legacyvault-web-client",
                "subject", Instant.now().plusSeconds(300)));
    }

    @Test
    void rejectsWrongIssuerAndAudience() throws Exception {
        assertInvalid(token(trustedKey, "https://attacker.example", "legacyvault-web-client",
                "subject", Instant.now().plusSeconds(300)));
        assertInvalid(token(trustedKey, "https://accounts.google.com", "another-client",
                "subject", Instant.now().plusSeconds(300)));
    }

    @Test
    void rejectsExpiredOrMissingSubjectClaims() throws Exception {
        assertInvalid(token(trustedKey, "https://accounts.google.com", "legacyvault-web-client",
                "subject", Instant.now().minusSeconds(5)));
        assertInvalid(token(trustedKey, "https://accounts.google.com", "legacyvault-web-client",
                "", Instant.now().plusSeconds(300)));
    }

    @Test
    void rejectsCredentialWhenClientIdIsNotConfigured() throws Exception {
        String token = token(trustedKey, "https://accounts.google.com", "legacyvault-web-client",
                "subject", Instant.now().plusSeconds(300));
        var unconfigured = new GoogleIdTokenVerifier(
                NimbusJwtDecoder.withPublicKey((java.security.interfaces.RSAPublicKey) trustedKey.getPublic()).build(), " ");

        BusinessException exception = assertThrows(BusinessException.class, () -> unconfigured.verify(token));
        assertEquals(ErrorCode.GOOGLE_SIGNIN_UNAVAILABLE, exception.getErrorCode());
    }

    private void assertInvalid(String token) {
        BusinessException exception = assertThrows(BusinessException.class, () -> verifier.verify(token));
        assertEquals(ErrorCode.INVALID_GOOGLE_CREDENTIAL, exception.getErrorCode());
    }

    private static KeyPair rsaKeyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        return generator.generateKeyPair();
    }

    private static String token(KeyPair keyPair, String issuer, String audience, String subject, Instant expiresAt)
            throws Exception {
        Instant issuedAt = Instant.now();
        String header = base64("{\"alg\":\"RS256\",\"typ\":\"JWT\"}");
        String payload = base64("{\"iss\":\"" + issuer + "\",\"aud\":\"" + audience + "\",\"sub\":\""
                + subject + "\",\"iat\":" + issuedAt.getEpochSecond() + ",\"exp\":" + expiresAt.getEpochSecond() + "}");
        String signedContent = header + "." + payload;
        Signature signature = Signature.getInstance("SHA256withRSA");
        signature.initSign(keyPair.getPrivate());
        signature.update(signedContent.getBytes(StandardCharsets.US_ASCII));
        return signedContent + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(signature.sign());
    }

    private static String base64(String value) {
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }
}
