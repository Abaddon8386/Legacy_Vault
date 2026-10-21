package com.legacyvault.auth.entity;

import jakarta.persistence.PostPersist;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GoogleLoginCredentialUseTest {
    @Test
    void newCredentialUseIsInsertedAndOnlyBecomesNotNewAfterPostPersist() throws Exception {
        GoogleLoginCredentialUse entity = new GoogleLoginCredentialUse("a".repeat(64), LocalDateTime.now());

        assertEquals("a".repeat(64), entity.getId());
        assertTrue(entity.isNew());
        assertTrue(GoogleLoginCredentialUse.class.getDeclaredMethod("markPersisted")
                .isAnnotationPresent(PostPersist.class));

        ReflectionTestUtils.invokeMethod(entity, "markPersisted");
        assertFalse(entity.isNew());
    }

    @Test
    void loadedCredentialUseIsNotNew() {
        GoogleLoginCredentialUse entity = new GoogleLoginCredentialUse("b".repeat(64), LocalDateTime.now());

        ReflectionTestUtils.invokeMethod(entity, "markLoaded");

        assertFalse(entity.isNew());
    }
}
