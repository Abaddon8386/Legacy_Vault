package com.legacyvault.beneficiary;

import com.legacyvault.common.error.BusinessException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="legacyvault.invitation-mail.enabled",havingValue="true")
public class InvitationMailWorker {
    private final InvitationMailDeliveryService service;
    private final InvitationMailTransport transport;
    public InvitationMailWorker(InvitationMailDeliveryService service,InvitationMailTransport transport) {this.service=service;this.transport=transport;}
    @Scheduled(fixedDelayString="${legacyvault.invitation-mail.poll-ms:1000}")
    public void deliver() {
        Long id;
        try {id=service.claim();} catch(RuntimeException unavailable){return;}
        if(id==null)return;
        boolean sending=false;
        try {
            var delivery=service.prepare(id);
            if(delivery==null)return;
            sending=true;
            transport.send(delivery);
            service.finish(id,"ACCEPTED");
        } catch(InvitationMailTransport.DeliveryFailure failure) {complete(id,failure.ambiguous()?"UNKNOWN":"FAILED");}
        catch(BusinessException denied){complete(id,"SKIPPED");}
        catch(RuntimeException unavailable){complete(id,sending?"UNKNOWN":"FAILED");}
    }
    private void complete(Long id,String state) {try{service.finish(id,state);}catch(RuntimeException ignored){/* Maintenance marks abandoned jobs UNKNOWN. */}}
}
