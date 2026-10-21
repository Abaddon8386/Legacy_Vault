package com.legacyvault.user.entity;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ExternalAuthIdentityTest {
    @Test
    void newIdentityHasUtcCreatedAt() {
        LocalDateTime before = LocalDateTime.now(ZoneOffset.UTC);
        ExternalAuthIdentity identity = new ExternalAuthIdentity("GOOGLE", "subject", new User());
        LocalDateTime after = LocalDateTime.now(ZoneOffset.UTC);

        assertNotNull(identity.getCreatedAt());
        assertTrue(!identity.getCreatedAt().isBefore(before));
        assertTrue(!identity.getCreatedAt().isAfter(after));
    }
}
