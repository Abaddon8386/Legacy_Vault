package com.legacyvault.auth.emailverification;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Retention only; never sends mail. */
@Component
public class EmailVerificationMaintenance {
    private final EmailVerificationService service;
    public EmailVerificationMaintenance(EmailVerificationService service) { this.service=service; }
    @Scheduled(fixedDelay=3600000,initialDelay=3600000)
    public void cleanup() {
        try { service.cleanup(); } catch(RuntimeException unavailable) { /* Do not log SQL data. */ }
    }
}
