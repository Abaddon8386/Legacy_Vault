package com.legacyvault.verification;

import com.legacyvault.verification.entity.VerificationCase;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import static org.junit.jupiter.api.Assertions.*;

class VerificationCaseNumberTest {
    @Test
    void stableReferenceUsesCreationYearAndDoesNotTruncateLargeIdentifiers() {
        VerificationCase item = new VerificationCase(1L, LocalDateTime.of(2025, 12, 31, 23, 59), 1L);
        ReflectionTestUtils.setField(item, "createdAt", LocalDateTime.of(2026, 1, 1, 0, 0));
        ReflectionTestUtils.setField(item, "verificationCaseId", 123L);
        assertEquals("HS-2026-000123", item.getCaseNumber());
        item.cancel(LocalDateTime.of(2027, 1, 1, 0, 0));
        assertEquals("HS-2026-000123", item.getCaseNumber());
        ReflectionTestUtils.setField(item, "verificationCaseId", 1000001L);
        assertEquals("HS-2026-1000001", item.getCaseNumber());
    }

    @Test
    void unpersistedCaseDoesNotInventReference() {
        assertThrows(IllegalStateException.class, () -> new VerificationCase(1L, LocalDateTime.now(), 1L).getCaseNumber());
    }
}
