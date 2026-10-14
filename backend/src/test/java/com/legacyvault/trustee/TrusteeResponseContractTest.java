package com.legacyvault.trustee;

import static org.junit.jupiter.api.Assertions.*;
import java.time.LocalDateTime;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.vault.entity.Vault;
import org.junit.jupiter.api.Test;

class TrusteeResponseContractTest {
    @Test
    void appointmentAndRevocationReceiptMatchesFrontendContract() throws Exception {
        Trustee trustee = new Trustee(new Vault(), "Trustee", null, "test@example.test", null, null);
        trustee.onCreate();
        ObjectMapper mapper = new ObjectMapper();
        var appointed = mapper.valueToTree(TrusteeDtos.Response.from(trustee));
        assertTrue(appointed.hasNonNull("appointedAt"));
        assertTrue(appointed.has("revokedAt"));
        assertTrue(appointed.get("revokedAt").isNull());
        assertFalse(appointed.has("createdAt"));
        trustee.update("Updated trustee", null, "test@example.test", null, null);
        trustee.onUpdate();
        assertEquals(appointed.get("appointedAt"), mapper.valueToTree(TrusteeDtos.Response.from(trustee)).get("appointedAt"));
        trustee.revoke(LocalDateTime.of(2026, 10, 14, 10, 0));
        var revoked = mapper.valueToTree(TrusteeDtos.Response.from(trustee));
        assertEquals("REVOKED", revoked.get("status").asText());
        assertEquals("2026-10-14T10:00:00Z", revoked.get("revokedAt").asText());
        assertEquals(appointed.get("appointedAt"), revoked.get("appointedAt"));
    }
}
