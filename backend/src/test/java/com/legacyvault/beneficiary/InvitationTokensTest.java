package com.legacyvault.beneficiary;

import java.time.LocalDateTime;
import java.util.HashSet;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class InvitationTokensTest {
    @Test void codesAreCanonical128BitSecretsAndHashesAreStable() {
        var tokens = new InvitationTokens();
        var codes = new HashSet<String>();
        for (int i = 0; i < 1000; i++) {
            String code = tokens.generate();
            assertEquals(22, code.length()); assertTrue(tokens.validFormat(code)); assertTrue(codes.add(code));
            assertEquals(16, java.util.Base64.getUrlDecoder().decode(code).length);
            assertEquals(64, tokens.hash(code).length()); assertEquals(tokens.hash(code), tokens.hash(code));
        }
        for (String code : new String[]{"", " ", "a".repeat(21), "a".repeat(23), "a".repeat(22), "!".repeat(22)}) {
            assertFalse(tokens.validFormat(code));
        }
        assertFalse(tokens.validFormat(null));
        assertEquals("ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb", tokens.hash("a"));
    }
    @Test void expiryIsExclusiveAndTerminalEvidenceDoesNotChangeWithTime() {
        var now = LocalDateTime.of(2026, 10, 20, 0, 0);
        var invitation = new BeneficiaryInvitation(null, 1, "hash", 1L, now);
        assertEquals("PENDING", invitation.state(now.plusDays(7).minusNanos(1)));
        assertEquals("EXPIRED", invitation.state(now.plusDays(7)));
        assertEquals("EXPIRED", invitation.state(now.plusDays(8)));
        invitation.consume(2L, now.plusDays(1));
        assertEquals("CONSUMED", invitation.state(now.plusDays(100)));
        assertEquals(now.plusDays(1), invitation.getConsumedAt());
        var revoked = new BeneficiaryInvitation(null, 1, "hash2", 1L, now);
        revoked.revoke(1L, now.plusDays(1));
        assertEquals("REVOKED", revoked.state(now.plusDays(100)));
    }
    @Test void issuedResponseDoesNotPrintSecret() {
        assertFalse(new InvitationDtos.Issued(null, "sensitive-code").toString().contains("sensitive-code"));
        assertFalse(new BeneficiaryInvitation().toString().contains("codeHash"));
    }
}
