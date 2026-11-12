package com.legacyvault.auth.emailverification;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Worker nền gửi email xác minh, mặc định tắt (bật bằng {@code legacyvault.auth.email-verification.delivery-enabled=true}).
 * Cần bean {@link EmailVerificationMailTransport} (cài đặt: {@link ResendEmailVerificationMailTransport}); thiếu thì
 * lỗi khi khởi động thay vì giả vờ đã gửi.
 */
@Component
@ConditionalOnProperty(name="legacyvault.auth.email-verification.delivery-enabled",havingValue="true")
public class EmailVerificationDeliveryWorker {
    /**
     * Dịch vụ quản lý hàng đợi và mã xác minh.
     */
    private final EmailVerificationService service;
    /**
     * Kênh gửi mail thực tế.
     */
    private final EmailVerificationMailTransport transport;
    /**
     * @param service   dịch vụ xác minh
     * @param transport kênh gửi mail
     */
    public EmailVerificationDeliveryWorker(EmailVerificationService service,EmailVerificationMailTransport transport) {
        this.service=service; this.transport=transport;
    }
    /**
     * Chạy định kỳ (mặc định 5 giây, {@code poll-ms}), tối đa 10 job mỗi lượt: claim -> prepare -> send -> mark
     * {@code ACCEPTED}; lỗi thì {@code FAILED}. Job đã CLAIMED không tự retry sau sự cố mơ hồ; không đẩy ngoại lệ nhà cung cấp ra log.
     */
    @Scheduled(fixedDelayString="${legacyvault.auth.email-verification.poll-ms:5000}")
    public void deliver() {
        // Bounded batch; a CLAIMED job is never retried automatically after a crash or ambiguous send.
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
                // Never forward provider exceptions to scheduler logs; the FAILED status is observable.
                try { service.mark(id,"FAILED"); } catch(RuntimeException ignored) { return; }
                if(Thread.currentThread().isInterrupted()) return;
            }
        }
    }
}
