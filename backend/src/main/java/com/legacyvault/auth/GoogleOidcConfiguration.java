package com.legacyvault.auth;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;

/**
 * Cấu hình Spring cho việc xác minh ID token Google (OIDC). Khóa ký của Google xoay vòng và được công bố tại
 * endpoint JWKS tin cậy bên dưới.
 */
@Configuration
public class GoogleOidcConfiguration {
    /**
     * URL JWKS công khai của Google để lấy khóa công khai kiểm tra chữ ký RS256.
     */
    static final String GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";

    /**
     * Bean {@link JwtDecoder} chỉ chấp nhận chữ ký RS256, nạp khóa từ {@link #GOOGLE_JWKS_URI}
     * (Nimbus tự cache/làm mới). Được {@link GoogleIdTokenVerifier} sử dụng.
     *
     * @return decoder JWT cho ID token của Google
     */
    @Bean("googleIdTokenDecoder")
    JwtDecoder googleIdTokenDecoder() {
        return NimbusJwtDecoder.withJwkSetUri(GOOGLE_JWKS_URI)
                .jwsAlgorithm(SignatureAlgorithm.RS256)
                .build();
    }
}
