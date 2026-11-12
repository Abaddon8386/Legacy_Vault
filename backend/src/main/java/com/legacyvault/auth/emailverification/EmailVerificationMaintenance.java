package com.legacyvault.auth.emailverification;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Dọn dữ liệu xác minh email theo giờ; không bao giờ gửi mail.
 */
@Component
public class EmailVerificationMaintenance {
    /**
     * Dịch vụ thực hiện việc dọn.
     */
    private final EmailVerificationService service;
    /**
     * @param service dịch vụ xác minh
     */
    public EmailVerificationMaintenance(EmailVerificationService service) { this.service=service; }
    /**
     * Chạy mỗi giờ (trễ đầu 1 giờ), gọi {@code service.cleanup()} và nuốt lỗi để không log dữ liệu SQL.
     */
    @Scheduled(fixedDelay=3600000,initialDelay=3600000)
    public void cleanup() {
        try { service.cleanup(); } catch(RuntimeException unavailable) { /* Do not log SQL data. */ }
    }
}
