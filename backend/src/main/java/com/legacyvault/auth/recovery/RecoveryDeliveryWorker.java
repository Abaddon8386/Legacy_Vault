package com.legacyvault.auth.recovery;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="legacyvault.auth.recovery.email-enabled",havingValue="true")
public class RecoveryDeliveryWorker {
    private final PasswordRecoveryService service;
    private final RecoveryMailTransport transport;
    public RecoveryDeliveryWorker(PasswordRecoveryService service,RecoveryMailTransport transport) {
        this.service=service; this.transport=transport;
    }
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
