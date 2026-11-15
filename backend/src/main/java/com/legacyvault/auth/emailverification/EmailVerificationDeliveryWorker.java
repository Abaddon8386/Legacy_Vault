package com.legacyvault.auth.emailverification;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Tắt mặc định. Bật nó cần một bean {@link EmailVerificationMailTransport}; hiện chưa có bean nào, nên
 * bật mà thiếu bean sẽ lỗi lúc khởi động thay vì giả vờ đã gửi mail.
 */
@Component
@ConditionalOnProperty(name="legacyvault.auth.email-verification.delivery-enabled",havingValue="true")
public class EmailVerificationDeliveryWorker {
    private final EmailVerificationService service;
    private final EmailVerificationMailTransport transport;
    public EmailVerificationDeliveryWorker(EmailVerificationService service,EmailVerificationMailTransport transport) {
        this.service=service; this.transport=transport;
    }
    /**
     * Worker định kỳ: nhận (claim) tối đa 10 job mỗi lượt, tạo credential ({@code prepare}), gửi qua transport rồi đánh dấu ACCEPTED/FAILED.
     * Job đã CLAIMED không bao giờ tự thử lại sau sự cố, tránh gửi trùng khi không chắc kết quả gửi lần trước.
     */
    @Scheduled(fixedDelayString="${legacyvault.auth.email-verification.poll-ms:5000}")
    public void deliver() {
        // Batch có giới hạn; job CLAIMED không bao giờ tự thử lại sau crash hoặc lần gửi không rõ kết quả.
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
                // Không bao giờ chuyển tiếp exception của provider vào log scheduler; trạng thái FAILED có thể quan sát được.
                try { service.mark(id,"FAILED"); } catch(RuntimeException ignored) { return; }
                if(Thread.currentThread().isInterrupted()) return;
            }
        }
    }
}
