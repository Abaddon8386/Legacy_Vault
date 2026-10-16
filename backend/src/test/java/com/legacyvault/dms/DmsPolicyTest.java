package com.legacyvault.dms;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class DmsPolicyTest {
    @Test
    void usesConfiguredGracePeriod() {
        assertEquals(3, new DmsPolicy(1, 32767, 3).gracePeriodDays());
    }

    @Test
    void rejectsGracePeriodOutsideDatabaseRange() {
        assertThrows(IllegalArgumentException.class, () -> new DmsPolicy(1, 32767, -1));
        assertThrows(IllegalArgumentException.class, () -> new DmsPolicy(1, 32767, 32768));
    }
}
