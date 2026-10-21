package com.legacyvault.beneficiary;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import com.legacyvault.common.error.BusinessException;

class GuardianPolicyTest {
    @Test void eighteenthBirthdayAndLeapDayBoundaries() {
        var dob=LocalDate.of(2008,10,21);
        assertEquals("MINOR",GuardianService.ageStatus(dob,LocalDate.of(2026,10,20)));
        assertEquals("ADULT",GuardianService.ageStatus(dob,LocalDate.of(2026,10,21)));
        assertEquals("ADULT",GuardianService.ageStatus(LocalDate.of(2008,2,29),LocalDate.of(2026,2,28)));
        assertEquals("UNKNOWN",GuardianService.ageStatus(null,LocalDate.of(2026,10,21)));
        assertEquals("UNKNOWN",GuardianService.ageStatus(LocalDate.of(2027,1,1),LocalDate.of(2026,10,21)));
    }
    @Test void contactsAreRequiredAndNoControlCharactersAreAllowed() {
        assertThrows(BusinessException.class,()->GuardianService.normalize(new GuardianDtos.UpsertRequest(0L,"Name","Parent"," ",null)));
        assertThrows(BusinessException.class,()->GuardianService.normalize(new GuardianDtos.UpsertRequest(0L,"Name\nInjected","Parent",null,"123")));
        var clean=GuardianService.normalize(new GuardianDtos.UpsertRequest(0L," Name "," Parent "," TEST@example.test ",null));
        assertEquals("Name",clean.fullName()); assertEquals("test@example.test",clean.email());
    }
}
