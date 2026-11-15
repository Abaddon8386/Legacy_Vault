package com.legacyvault.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;

/** Google công bố các khóa ký OIDC xoay vòng tại endpoint tin cậy này. */
@Configuration
public class GoogleOidcConfiguration {
    static final String GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";

    // Decoder JWT của Google: tải JWK set từ endpoint chính thức, chỉ chấp nhận RS256.
    // Chỉ kiểm tra chữ ký/thời hạn; issuer, audience và các claim OIDC được kiểm tra thêm trong GoogleIdTokenVerifier.
    @Bean("googleIdTokenDecoder")
    JwtDecoder googleIdTokenDecoder() {
        return NimbusJwtDecoder.withJwkSetUri(GOOGLE_JWKS_URI)
                .jwsAlgorithm(SignatureAlgorithm.RS256)
                .build();
    }
}
