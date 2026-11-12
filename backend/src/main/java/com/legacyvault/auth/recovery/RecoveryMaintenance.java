package com.legacyvault.auth.recovery;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Dọn dữ liệu khôi phục theo giờ; chạy cả khi tắt gửi email và không bao giờ gửi mail.
 */
@Component
public class RecoveryMaintenance {
    /**
     * Dịch vụ thực hiện việc dọn.
     */
    private final PasswordRecoveryService service;
    /**
     * @param service dịch vụ khôi phục
     */
    public RecoveryMaintenance(PasswordRecoveryService service) { this.service=service; }
    /**
     * Chạy mỗi giờ (trễ đầu 1 giờ), gọi {@code service.cleanup()}; nuốt lỗi để không log dữ liệu SQL/nhà cung cấp.
     */
    @Scheduled(fixedDelay=3600000,initialDelay=3600000)
    public void cleanup() {
        try { service.cleanup(); } catch(RuntimeException unavailable) { /* Do not log SQL/provider data. */ }
    }
}
