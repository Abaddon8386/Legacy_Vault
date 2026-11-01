package com.legacyvault.auth.emailverification;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Off by default. Enabling it requires an {@link EmailVerificationMailTransport} bean; none ships yet, so
 * enabling without one fails at startup instead of pretending mail was sent.
 */
@Component
@ConditionalOnProperty(name="legacyvault.auth.email-verification.delivery-enabled",havingValue="true")
public class EmailVerificationDeliveryWorker {
    private final EmailVerificationService service;
    private final EmailVerificationMailTransport transport;
    public EmailVerificationDeliveryWorker(EmailVerificationService service,EmailVerificationMailTransport transport) {
        this.service=service; this.transport=transport;
    }
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
