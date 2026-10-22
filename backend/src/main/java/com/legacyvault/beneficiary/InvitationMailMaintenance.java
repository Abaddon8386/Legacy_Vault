package com.legacyvault.beneficiary;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class InvitationMailMaintenance {
    private final InvitationMailDeliveryService service;
    public InvitationMailMaintenance(InvitationMailDeliveryService service){this.service=service;}
    @Scheduled(fixedDelay=3600000)
    public void cleanup(){try{service.cleanup();}catch(RuntimeException ignored){/* No payload/provider details in scheduler logs. */}}
}
