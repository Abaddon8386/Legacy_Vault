package com.legacyvault.auth.emailverification;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Chỉ dọn dẹp theo thời hạn lưu giữ; không bao giờ gửi mail. */
@Component
public class EmailVerificationMaintenance {
    private final EmailVerificationService service;
    public EmailVerificationMaintenance(EmailVerificationService service) { this.service=service; }
    // Dọn dẹp mỗi giờ (lần đầu sau 1 giờ); lỗi bị nuốt có chủ đích để không ghi dữ liệu SQL vào log.
    @Scheduled(fixedDelay=3600000,initialDelay=3600000)
    public void cleanup() {
        try { service.cleanup(); } catch(RuntimeException unavailable) { /* Do not log SQL data. */ }
    }
}
