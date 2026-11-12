package com.legacyvault.audit;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Cấu hình bean Jackson {@link ObjectMapper} (gói {@code com.fasterxml}) dùng bởi {@code AuditService} để tuần tự
 * hóa JSON cho các cột {@code details}, {@code actor_roles}, {@code state_before}, {@code state_after}.
 */
@Configuration
public class JacksonConfig {

    /** Cung cấp {@link ObjectMapper} mặc định (không cấu hình thêm) cho toàn ứng dụng. */
    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper();
    }
}