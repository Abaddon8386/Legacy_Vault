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
    @Test void sharedSendMessageNeedsOnlyProviderSettingsNotRecoveryEnablementAndStillEnforcesAllowlist() throws Exception {
        var client=mock(HttpClient.class); HttpResponse<Void> response=mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200); when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(response);
        var recoveryOff=new RecoveryConfiguration(false,"fixture-api-key","sender@example.test","","recipient@example.test");
        var transport=new ResendRecoveryMailTransport(recoveryOff,new ObjectMapper(),client);
        transport.sendMessage("recipient@example.test","subject","body");
        verify(client,times(1)).send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class));
        assertThrows(IllegalStateException.class,()->transport.send("recipient@example.test","en","secret"));
        assertThrows(IllegalStateException.class,()->transport.sendMessage("not-approved@example.test","subject","body"));
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
    static String bodyOf(HttpRequest request) throws Exception {
        var out=new java.io.ByteArrayOutputStream(); var done=new java.util.concurrent.CountDownLatch(1);
        request.bodyPublisher().orElseThrow().subscribe(new java.util.concurrent.Flow.Subscriber<java.nio.ByteBuffer>() {
            public void onSubscribe(java.util.concurrent.Flow.Subscription s) { s.request(Long.MAX_VALUE); }
            public void onNext(java.nio.ByteBuffer b) { byte[] a=new byte[b.remaining()]; b.get(a); out.writeBytes(a); }
            public void onError(Throwable t) { done.countDown(); }
            public void onComplete() { done.countDown(); }
        });
        done.await(); return out.toString(java.nio.charset.StandardCharsets.UTF_8);
    }
    @Test void redirectSendsEveryMailToTheFixedMailboxAndNamesTheAccountInTheBody() throws Exception {
        var client=mock(HttpClient.class); HttpResponse<Void> response=mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200); when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(response);
        var cfg=new RecoveryConfiguration(true,"fixture-api-key","sender@example.test","https://frontend.example.test/reset-password","","Inbox@Example.Test");
        new ResendRecoveryMailTransport(cfg,new ObjectMapper(),client).send("fake.account@example.test","en","fixture-reset-credential");
        var request=ArgumentCaptor.forClass(HttpRequest.class);
        verify(client).send(request.capture(),any(HttpResponse.BodyHandler.class));
        var sent=bodyOf(request.getValue());
        assertTrue(sent.contains("\"to\":[\"inbox@example.test\"]"),sent);
        assertFalse(sent.contains("\"to\":[\"fake.account@example.test\"]"));
        assertTrue(sent.contains("Account / Tài khoản: fake.account@example.test"));
        assertTrue(sent.contains("fixture-reset-credential"));
    }
    @Test void withoutRedirectTheAccountMailboxIsUsedUnchanged() throws Exception {
        var client=mock(HttpClient.class); HttpResponse<Void> response=mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200); when(client.send(any(HttpRequest.class),any(HttpResponse.BodyHandler.class))).thenReturn(response);
        new ResendRecoveryMailTransport(config(),new ObjectMapper(),client).send("recipient@example.test","en","c");
        var request=ArgumentCaptor.forClass(HttpRequest.class);
        verify(client).send(request.capture(),any(HttpResponse.BodyHandler.class));
        var sent=bodyOf(request.getValue());
        assertTrue(sent.contains("\"to\":[\"recipient@example.test\"]"));
        assertFalse(sent.contains("Tài khoản:"));
    }
    @Test void invalidRedirectAddressFailsStartup() {
        assertThrows(IllegalArgumentException.class,()->new RecoveryConfiguration(false,"k","s@example.test","","","not-an-email"));
        assertThrows(IllegalArgumentException.class,()->new RecoveryConfiguration(false,"k","s@example.test","","","a@example.test,b@example.test"));
    }
}
