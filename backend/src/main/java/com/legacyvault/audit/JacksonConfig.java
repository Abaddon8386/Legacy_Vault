package com.legacyvault.audit;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Khai báo bean {@link ObjectMapper} dùng chung (cấu hình mặc định), AuditService dùng để tuần tự hóa dữ liệu audit.
 */
@Configuration
public class JacksonConfig {

    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper();
    }
}