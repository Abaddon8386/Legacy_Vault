package com.legacyvault.beneficiary;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.*;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ResendInvitationMailTransportTest {
    final InvitationMailConfiguration config=new InvitationMailConfiguration(true,"fixture-key","sender@example.test","recipient@example.test");
    final InvitationMailDeliveryService.Delivery delivery=new InvitationMailDeliveryService.Delivery(UUID.randomUUID(),"recipient@example.test","fixture-secret-code");
    @Test void fixedProviderEndpointTimeoutAndStableIdempotencyKey() throws Exception {
        var client=mock(HttpClient.class);HttpResponse<String> response=mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);when(response.body()).thenReturn("{\"id\":\""+UUID.randomUUID()+"\"}");
        when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(response);
        new ResendInvitationMailTransport(config,new ObjectMapper(),client).send(delivery);
        var capture=ArgumentCaptor.forClass(HttpRequest.class);verify(client).send(capture.capture(),any(HttpResponse.BodyHandler.class));
        assertEquals("https://api.resend.com/emails",capture.getValue().uri().toString());
        assertEquals("beneficiary-invitation/"+delivery.outboxId(),capture.getValue().headers().firstValue("Idempotency-Key").orElseThrow());
        assertEquals(java.time.Duration.ofSeconds(10),capture.getValue().timeout().orElseThrow());
        assertFalse(delivery.toString().contains(delivery.invitationCode()));assertFalse(delivery.toString().contains(delivery.recipientEmail()));
    }
    @Test void disabledAndUnapprovedRecipientsNeverContactProvider() throws Exception {
        var client=mock(HttpClient.class);
        var disabled=new ResendInvitationMailTransport(new InvitationMailConfiguration(false,"","",""),new ObjectMapper(),client);
        assertThrows(InvitationMailTransport.DeliveryFailure.class,()->disabled.send(delivery));
        var transport=new ResendInvitationMailTransport(config,new ObjectMapper(),client);
        assertThrows(InvitationMailTransport.DeliveryFailure.class,()->transport.send(new InvitationMailDeliveryService.Delivery(UUID.randomUUID(),"other@example.test","secret")));
        verifyNoInteractions(client);
        assertThrows(IllegalArgumentException.class,()->new InvitationMailConfiguration(true,"","",""));
        assertThrows(IllegalArgumentException.class,()->new InvitationMailConfiguration(true,"key","sender\r\n@example.test","recipient@example.test"));
    }
    @Test void providerFailuresAreClassifiedWithoutLeakingBodiesOrAutomaticallyRetrying() throws Exception {
        for(int status:new int[]{400,401,409,429,500,503}) {
            var client=mock(HttpClient.class);HttpResponse<String> response=mock(HttpResponse.class);
            when(response.statusCode()).thenReturn(status);when(response.body()).thenReturn("PRIVATE PROVIDER RESPONSE");
            when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(response);
            var transport=new ResendInvitationMailTransport(config,new ObjectMapper(),client);
            var failure=assertThrows(InvitationMailTransport.DeliveryFailure.class,()->transport.send(delivery));
            assertEquals(status>=500,failure.ambiguous());assertNull(failure.getCause());
            assertEquals("Invitation delivery unavailable",failure.getMessage());verify(client,times(1)).send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class));
        }
    }
    @Test void networkTimeoutOrInvalidSuccessReceiptIsAmbiguous() throws Exception {
        var client=mock(HttpClient.class);
        when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenThrow(new java.io.IOException("secret in provider exception"));
        var transport=new ResendInvitationMailTransport(config,new ObjectMapper(),client);
        var failure=assertThrows(InvitationMailTransport.DeliveryFailure.class,()->transport.send(delivery));
        assertTrue(failure.ambiguous());assertNull(failure.getCause());
        HttpResponse<String> response=mock(HttpResponse.class);when(response.statusCode()).thenReturn(200);when(response.body()).thenReturn("{}");
        when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(response);
        assertTrue(assertThrows(InvitationMailTransport.DeliveryFailure.class,()->transport.send(delivery)).ambiguous());
    }
}
