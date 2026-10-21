package com.legacyvault.auth.recovery;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Retention runs even while email delivery is disabled. Never sends mail. */
@Component
public class RecoveryMaintenance {
    private final PasswordRecoveryService service;
    public RecoveryMaintenance(PasswordRecoveryService service) { this.service=service; }
    @Scheduled(fixedDelay=3600000,initialDelay=3600000)
    public void cleanup() {
        try { service.cleanup(); } catch(RuntimeException unavailable) { /* Do not log SQL/provider data. */ }
    }
}
