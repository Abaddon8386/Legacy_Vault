package com.legacyvault.beneficiary;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.mockito.Mockito.*;

class InvitationMailWorkerTest {
    @Test void noJobMakesNoProviderCall() {
        var service=mock(InvitationMailDeliveryService.class);var transport=mock(InvitationMailTransport.class);
        new InvitationMailWorker(service,transport).deliver();verifyNoInteractions(transport);
    }
    @Test void sendsOnlyPreparedJobAndMarksProviderAcceptance() {
        var service=mock(InvitationMailDeliveryService.class);var transport=mock(InvitationMailTransport.class);
        var delivery=new InvitationMailDeliveryService.Delivery(UUID.randomUUID(),"recipient@example.test","secret");
        when(service.claim()).thenReturn(1L);when(service.prepare(1L)).thenReturn(delivery);
        new InvitationMailWorker(service,transport).deliver();
        var order=inOrder(service,transport);order.verify(service).claim();order.verify(service).prepare(1L);order.verify(transport).send(delivery);order.verify(service).finish(1L,"ACCEPTED");
    }
    @Test void ineligibleJobIsNotSent() {
        var service=mock(InvitationMailDeliveryService.class);var transport=mock(InvitationMailTransport.class);
        when(service.claim()).thenReturn(1L);new InvitationMailWorker(service,transport).deliver();verifyNoInteractions(transport);
    }
    @Test void failedAndAmbiguousResultsAreNotRetried() {
        for(boolean ambiguous:new boolean[]{true,false}) {
            var service=mock(InvitationMailDeliveryService.class);var transport=mock(InvitationMailTransport.class);
            var delivery=new InvitationMailDeliveryService.Delivery(UUID.randomUUID(),"recipient@example.test","secret");
            when(service.claim()).thenReturn(1L);when(service.prepare(1L)).thenReturn(delivery);
            doThrow(new InvitationMailTransport.DeliveryFailure(ambiguous)).when(transport).send(delivery);
            new InvitationMailWorker(service,transport).deliver();verify(transport,times(1)).send(delivery);verify(service).finish(1L,ambiguous?"UNKNOWN":"FAILED");
        }
    }
    @Test void acceptancePersistenceFailureDoesNotRetryTheProvider() {
        var service=mock(InvitationMailDeliveryService.class);var transport=mock(InvitationMailTransport.class);
        var delivery=new InvitationMailDeliveryService.Delivery(UUID.randomUUID(),"recipient@example.test","secret");
        when(service.claim()).thenReturn(1L);when(service.prepare(1L)).thenReturn(delivery);
        doThrow(new IllegalStateException()).when(service).finish(1L,"ACCEPTED");
        new InvitationMailWorker(service,transport).deliver();verify(transport,times(1)).send(delivery);verify(service).finish(1L,"UNKNOWN");
    }
}
