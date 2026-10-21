package com.legacyvault.dms;

import com.legacyvault.common.error.BusinessException;
import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import static org.junit.jupiter.api.Assertions.*;

class DmsMinutePolicyTest {
    private final DmsPolicy policy=new DmsPolicy(1,180,1);
    @Test void acceptsMinuteBoundsAndLegacyDaysWithoutRounding() {
        assertEquals(1,policy.resolveMinutes(new DmsDtos.ConfigureRequest(null,1)));
        assertEquals(1501,policy.resolveMinutes(new DmsDtos.ConfigureRequest(null,1501)));
        assertEquals(259200,policy.resolveMinutes(new DmsDtos.ConfigureRequest(180)));
        assertEquals(259200,policy.resolveMinutes(new DmsDtos.ConfigureRequest(null,259200)));
    }
    @Test void rejectsMissingConflictingInvalidAndOutOfRangeDurations() {
        for(var request:new DmsDtos.ConfigureRequest[]{new DmsDtos.ConfigureRequest(null,null),new DmsDtos.ConfigureRequest(1,1440),
                new DmsDtos.ConfigureRequest(0),new DmsDtos.ConfigureRequest(181),new DmsDtos.ConfigureRequest(Integer.MAX_VALUE),
                new DmsDtos.ConfigureRequest(null,0),new DmsDtos.ConfigureRequest(null,-1),new DmsDtos.ConfigureRequest(null,259201),new DmsDtos.ConfigureRequest(null,Integer.MAX_VALUE)})
            assertThrows(BusinessException.class,()->policy.resolveMinutes(request));
    }
    @Test void checkInAndCancelUseExactMinutesAndLegacyConstructorRemainsExact() {
        var now=LocalDateTime.of(2026,10,20,8,0);
        var c=DmsConfig.withMinutes(1L,1501,1,now);
        assertNull(c.getCheckIntervalDays());c.checkIn(now);assertEquals(now.plusMinutes(1501),c.getNextCheckAt());
        c.restoreAfterAlert(now.plusMinutes(1));assertEquals(now.plusMinutes(1502),c.getNextCheckAt());assertNull(c.getTriggeredAt());
        var old=new DmsConfig(2L,32767,1,now);old.checkIn(now);assertEquals(now.plusDays(32767),old.getNextCheckAt());
    }
}
