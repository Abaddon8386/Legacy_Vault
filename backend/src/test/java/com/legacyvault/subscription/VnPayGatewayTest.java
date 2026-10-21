package com.legacyvault.subscription;

import com.legacyvault.subscription.service.VnPayGateway;
import org.junit.jupiter.api.Test;
import org.springframework.util.LinkedMultiValueMap;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class VnPayGatewayTest {
    static VnPayGateway gateway() { return new VnPayGateway(true,"TEST1234","sandbox-test-secret-not-a-real-key","http://localhost:5173/subscription"); }
    @Test void checkoutUsesSandboxV21ServerAmountAndVietnamTime() {
        String url=gateway().checkout(UUID.fromString("00000000-0000-0000-0000-000000000001"),499000,
            Instant.parse("2026-10-20T01:00:00Z"),Instant.parse("2026-10-20T01:15:00Z"),"127.0.0.1");
        assertTrue(url.startsWith(VnPayGateway.CHECKOUT+"?"));
        assertTrue(url.contains("vnp_Amount=49900000")); assertTrue(url.contains("vnp_CreateDate=20261020080000"));
        assertTrue(url.contains("vnp_ExpireDate=20261020081500")); assertTrue(url.contains("vnp_Version=2.1.0"));
        var query=new LinkedMultiValueMap<String,String>();
        for(String part:url.substring(url.indexOf('?')+1).split("&")) {
            var pair=part.split("=",2);
            query.add(java.net.URLDecoder.decode(pair[0],java.nio.charset.StandardCharsets.US_ASCII),
                java.net.URLDecoder.decode(pair[1],java.nio.charset.StandardCharsets.US_ASCII));
        }
        assertTrue(gateway().verified(query).isPresent());
        query.set("vnp_Amount","100"); assertTrue(gateway().verified(query).isEmpty());
    }
    @Test void hmacMatchesIndependentKnownVector() {
        var g=new VnPayGateway(true,"TEST1234","key".repeat(6),"http://localhost:5173/subscription");
        assertEquals("4e4bd756d31df4187825d70b29b17603fa078825d19289aca64a578b7c617b0752cebe24016190aa5138b02bbd851ce673b6762c897e9fbd004be4994dbfbd92",g.sign(Map.of()));
    }
    @Test void rejectsDuplicateMalformedDisabledAndUnconfiguredCallbacks() {
        var q=new LinkedMultiValueMap<String,String>();q.add("vnp_TxnRef","test");q.add("vnp_SecureHash",gateway().sign(Map.of("vnp_TxnRef","test")));
        assertTrue(gateway().verified(q).isPresent());
        q.add("vnp_TxnRef","second");assertTrue(gateway().verified(q).isEmpty());
        q.set("vnp_SecureHash","z".repeat(128));assertTrue(gateway().verified(q).isEmpty());
        assertFalse(new VnPayGateway(false,"","","").available());
        assertThrows(IllegalStateException.class,()->new VnPayGateway(true,"","",""));
        assertThrows(IllegalStateException.class,()->new VnPayGateway(true,"TEST1234","long-test-secret","https://example.test/subscription?x=1"));
    }
}
