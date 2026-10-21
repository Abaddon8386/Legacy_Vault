package com.legacyvault.auth.recovery;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ResendRecoveryMailTransportTest {
    RecoveryConfiguration config() {
        return new RecoveryConfiguration(true,"fixture-api-key","sender@example.test","https://frontend.example.test/reset-password","recipient@example.test");
    }
    @Test void providerAcceptanceUsesFixedHttpsEndpointWithoutFollowingUserRedirects() throws Exception {
        var client=mock(HttpClient.class); HttpResponse<Void> response=mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200); when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(response);
        var transport=new ResendRecoveryMailTransport(config(),new ObjectMapper(),client);
        transport.send("recipient@example.test","en","fixture-reset-credential");
        var request=ArgumentCaptor.forClass(HttpRequest.class);
        verify(client,times(1)).send(request.capture(),any(HttpResponse.BodyHandler.class));
        assertEquals("https://api.resend.com/emails",request.getValue().uri().toString());
        assertEquals("POST",request.getValue().method());
        assertEquals("Bearer fixture-api-key",request.getValue().headers().firstValue("Authorization").orElseThrow());
        assertEquals(java.time.Duration.ofSeconds(10),request.getValue().timeout().orElseThrow());
    }
    @Test void failedOrAmbiguousSendIsNotRetriedAndSensitiveExceptionIsDiscarded() throws Exception {
        var client=mock(HttpClient.class);
        when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenThrow(new java.io.IOException("sensitive provider request"));
        var transport=new ResendRecoveryMailTransport(config(),new ObjectMapper(),client);
        var failure=assertThrows(IllegalStateException.class,()->transport.send("recipient@example.test","en","secret"));
        assertEquals("Recovery delivery unavailable",failure.getMessage()); assertNull(failure.getCause());
        verify(client,times(1)).send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class));
    }
    @Test void disabledOrUnapprovedRecipientNeverMakesNetworkCall() {
        var client=mock(HttpClient.class);
        var disabled=new ResendRecoveryMailTransport(new RecoveryConfiguration(false,"","","",""),new ObjectMapper(),client);
        assertThrows(IllegalStateException.class,()->disabled.send("recipient@example.test","vi","secret"));
        var enabled=new ResendRecoveryMailTransport(config(),new ObjectMapper(),client);
        assertThrows(IllegalStateException.class,()->enabled.send("not-approved@example.test","vi","secret"));
        verifyNoInteractions(client);
    }
}
