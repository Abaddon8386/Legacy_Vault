package com.legacyvault.auth;

import com.legacyvault.auth.policy.PasswordPolicy;
import com.legacyvault.auth.recovery.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RecoverySecurityTest {
    final RecoverySecrets secrets=new RecoverySecrets(Base64.getEncoder().encodeToString(new byte[32]));
    @Test void randomCredentialsAreCanonical256BitAndPurposeBound() {
        Set<String> values=new HashSet<>();
        for(int i=0;i<1000;i++) {
            String token=secrets.generate(); assertTrue(secrets.valid(token)); assertEquals(43,token.length());
            assertEquals(32,Base64.getUrlDecoder().decode(token).length); assertTrue(values.add(token));
            assertEquals(64,secrets.hash(token).length()); assertFalse(secrets.hash(token).contains(token));
        }
        assertFalse(secrets.valid(null)); assertFalse(secrets.valid("a".repeat(43)));
        assertFalse(secrets.valid("a".repeat(42)+"="));
        assertNotEquals(secrets.bucket("email","a@b.test"),secrets.bucket("ip","a@b.test"));
    }
    @Test void sharedPolicyHandlesUtf8AndSurrogatesWithoutTrimming() {
        var p=new PasswordPolicy();
        assertTrue(p.isValid("a".repeat(72),null)); assertTrue(p.isValid("á".repeat(36),null));
        assertFalse(p.isValid("á".repeat(37),null)); assertFalse(p.isValid("a".repeat(73),null));
        assertFalse(p.isValid("short",null)); assertFalse(p.isValid(" ".repeat(8),null));
        assertFalse(p.isValid("abcdefgh\uD800",null)); assertFalse(p.isValid("abc\0defgh",null));
        assertTrue(p.isValid(" leading trailing ",null));
    }
    @Test void deliveryIsOffByDefaultAndRequiresExactSafeUrlAndRecipients() {
        assertFalse(new RecoveryConfiguration(false,"","","","").ready());
        assertThrows(IllegalArgumentException.class,()->new RecoveryConfiguration(true,"test","sender@sample.test","https://sample.test/reset-password",""));
        for(String uri:List.of("http://evil.test/reset-password","https://good.test/reset-password?next=evil","https://u:p@good.test/reset-password","https://good.test/other","http://localhost:5174/reset-password")) {
            assertThrows(IllegalArgumentException.class,()->new RecoveryConfiguration(true,"test","sender@sample.test",uri,"recipient@sample.test"));
        }
        var c=new RecoveryConfiguration(true,"fixture-key","sender@sample.test","http://localhost:5173/reset-password","recipient@sample.test");
        assertTrue(c.ready()); assertTrue(c.permits(" Recipient@sample.test ")); assertFalse(c.permits("other@sample.test"));
    }
    @Test void dtoAndDeliveryNeverPrintSecrets() {
        assertFalse(new PasswordRecoveryController.Reset("secret","password").toString().contains("secret"));
        assertEquals("RecoveryDelivery[redacted]",new PasswordRecoveryService.Delivery(1L,"private@test","vi","secret").toString());
    }
    @Test void workerRecordsFailuresAndDoesNotAutomaticallyRetryAmbiguousSend() {
        var service=mock(PasswordRecoveryService.class); var transport=mock(RecoveryMailTransport.class);
        when(service.claim()).thenReturn(1L,null);
        when(service.prepare(1L)).thenReturn(new PasswordRecoveryService.Delivery(1L,"fixture@test","vi","secret"));
        doThrow(new IllegalStateException("provider-sensitive-detail")).when(transport).send(any(),any(),any());
        assertDoesNotThrow(()->new RecoveryDeliveryWorker(service,transport).deliver());
        verify(service).mark(1L,"FAILED"); verify(transport,times(1)).send(any(),any(),any());
    }
    @Test void interruptedWorkerDoesNotClaimMoreJobsAfterAnAmbiguousSend() {
        var service=mock(PasswordRecoveryService.class); var transport=mock(RecoveryMailTransport.class);
        when(service.claim()).thenReturn(1L,2L,null);
        when(service.prepare(1L)).thenReturn(new PasswordRecoveryService.Delivery(1L,"fixture@test","vi","secret"));
        doAnswer(call->{Thread.currentThread().interrupt();throw new IllegalStateException("interrupted");})
                .when(transport).send(any(),any(),any());
        try {
            new RecoveryDeliveryWorker(service,transport).deliver();
            verify(service,times(1)).claim(); verify(service).mark(1L,"FAILED");
        } finally { Thread.interrupted(); }
    }
}
