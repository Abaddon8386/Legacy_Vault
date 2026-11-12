package com.legacyvault.auth.recovery;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Tác vụ nền gửi email khôi phục, chỉ tạo khi {@code legacyvault.auth.recovery.email-enabled=true}. Lấy job từ
 * {@link PasswordRecoveryService}, chuẩn bị mã và gửi qua {@link RecoveryMailTransport}.
 */
@Component
@ConditionalOnProperty(name="legacyvault.auth.recovery.email-enabled",havingValue="true")
public class RecoveryDeliveryWorker {
    /**
     * Dịch vụ quản lý hàng đợi và mã khôi phục.
     */
    private final PasswordRecoveryService service;
    /**
     * Kênh gửi mail thực tế (Resend).
     */
    private final RecoveryMailTransport transport;
    /**
     * @param service   dịch vụ khôi phục
     * @param transport kênh gửi mail
     */
    public RecoveryDeliveryWorker(PasswordRecoveryService service,RecoveryMailTransport transport) {
        this.service=service; this.transport=transport;
    }
    /**
     * Chạy định kỳ (mặc định 5 giây, {@code legacyvault.auth.recovery.poll-ms}), xử lý tối đa 10 job mỗi lượt: claim -> prepare ->
     * send -> mark {@code ACCEPTED}. Lỗi gửi đánh dấu {@code FAILED}; job đã CLAIMED không bao giờ tự retry khi sự cố mơ hồ.
     * Không đẩy ngoại lệ của nhà cung cấp ra log.
     */
    @Scheduled(fixedDelayString="${legacyvault.auth.recovery.poll-ms:5000}")
    public void deliver() {
        // Bounded batch; a CLAIMED job is never automatically retried after a crash/ambiguous send.
        for(int i=0;i<10;i++) {
            Long id;
            try { id=service.claim(); } catch(RuntimeException unavailable) { return; }
            if(id==null) return;
            try {
                var delivery=service.prepare(id);
                if(delivery!=null) {
                    transport.send(delivery.email(),delivery.locale(),delivery.credential());
                    service.mark(id,"ACCEPTED");
                }
            } catch(RuntimeException failure) {
                // Never forward provider exceptions to scheduler logs. Status is observable internally.
                try { service.mark(id,"FAILED"); } catch(RuntimeException ignored) { return; }
                if(Thread.currentThread().isInterrupted()) return;
            }
        }
    }
}
