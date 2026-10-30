package com.legacyvault.auth.emailverification;

import com.legacyvault.auth.recovery.ResendRecoveryMailTransport;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class EmailVerificationConfigurationTest {
    static EmailVerificationConfiguration with(String url) {
        return new EmailVerificationConfiguration(true,1440,"1/60,3/900,5/86400","5/900",url);
    }

    @Test void approvedDefaultsAreTheDecidedPolicy() {
        var c=new EmailVerificationConfiguration(false,1440,"1/60,3/900,5/86400","5/900","");
        assertEquals(1440,c.ttlMinutes());
        assertEquals(java.util.List.of(new EmailVerificationConfiguration.Limit(1,60),new EmailVerificationConfiguration.Limit(3,900),
                new EmailVerificationConfiguration.Limit(5,86400)),c.sendLimits());
        assertEquals(new EmailVerificationConfiguration.Limit(5,900),c.confirmLimit());
        assertFalse(c.ready(), "requests stay unavailable until delivery is enabled");
    }
    @Test void onlyTheTwoApprovedVerifyUrlShapesAreAccepted() {
        assertTrue(with("https://app.example.test/verify-email").verifyUrlValid());
        assertTrue(with("http://localhost:5173/verify-email").verifyUrlValid());
        for(String bad:java.util.List.of("","http://app.example.test/verify-email","http://localhost:3000/verify-email","http://localhost/verify-email",
                "https://app.example.test/reset-password","https://app.example.test/verify-email?next=https://evil.test",
                "https://app.example.test/verify-email#x","https://user@app.example.test/verify-email","javascript:alert(1)"))
            assertThrows(IllegalArgumentException.class,()->with(bad),bad);
    }
    @Test void malformedOrOutOfRangeLimitsAndTtlFailFast() {
        for(String bad:java.util.List.of("","3","0/60","3/0","3/86401","a/b","1/60,"))
            assertThrows(RuntimeException.class,()->new EmailVerificationConfiguration(false,1440,bad,"5/900",""),bad);
        assertThrows(IllegalArgumentException.class,()->new EmailVerificationConfiguration(false,0,"1/60","5/900",""));
    }
    @Test void linkPutsTheCredentialInTheFragmentOnly() {
        assertEquals("https://app.example.test/verify-email#token=abc",with("https://app.example.test/verify-email").link("abc"));
    }
    @Test void transportSendsTheServerBuiltLinkThroughTheSharedResendCall() {
        var resend=mock(ResendRecoveryMailTransport.class);
        new ResendEmailVerificationMailTransport(with("https://app.example.test/verify-email"),resend).send("who@example.test","en","secret-credential");
        var subject=ArgumentCaptor.forClass(String.class); var text=ArgumentCaptor.forClass(String.class);
        verify(resend).sendMessage(eq("who@example.test"),subject.capture(),text.capture());
        assertEquals("Verify your LegacyVault email",subject.getValue());
        assertTrue(text.getValue().endsWith("https://app.example.test/verify-email#token=secret-credential"));
        assertTrue(text.getValue().contains("24 hours"));
    }
}
