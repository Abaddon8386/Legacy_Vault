package com.legacyvault.subscription;

import com.legacyvault.subscription.service.VnPayGateway;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class VnPayQueryGatewayTest {
    static final String SECRET="sandbox-test-secret-not-a-real-key";
    static final String[] FIELDS={"vnp_ResponseId","vnp_Command","vnp_ResponseCode","vnp_Message","vnp_TmnCode","vnp_TxnRef",
        "vnp_Amount","vnp_BankCode","vnp_PayDate","vnp_TransactionNo","vnp_TransactionType","vnp_TransactionStatus",
        "vnp_OrderInfo","vnp_PromotionCode","vnp_PromotionAmount"};
    static String hmac(String text) throws Exception {
        Mac mac=Mac.getInstance("HmacSHA512");mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8),"HmacSHA512"));
        return HexFormat.of().formatHex(mac.doFinal(text.getBytes(StandardCharsets.UTF_8)));
    }
    public static Map<String,String> signed(UUID id,Instant paid,long amount) throws Exception {
        var m=new LinkedHashMap<String,String>();
        for(String f:FIELDS)m.put(f,"");
        m.put("vnp_ResponseId",UUID.randomUUID().toString().replace("-",""));m.put("vnp_Command","querydr");
        m.put("vnp_ResponseCode","00");m.put("vnp_Message","Thành công");m.put("vnp_TmnCode","TEST1234");
        m.put("vnp_TxnRef",id.toString().replace("-",""));m.put("vnp_Amount",Long.toString(amount*100));
        m.put("vnp_BankCode","NCB");m.put("vnp_PayDate",java.time.format.DateTimeFormatter.ofPattern("uuuuMMddHHmmss")
            .withZone(java.time.ZoneId.of("Asia/Ho_Chi_Minh")).format(paid));
        m.put("vnp_TransactionNo",Long.toString(Math.abs(UUID.randomUUID().getLeastSignificantBits()%99999999999999L)+1));
        m.put("vnp_TransactionType","01");m.put("vnp_TransactionStatus","00");m.put("vnp_OrderInfo","Query LegacyVault payment");
        resign(m);return m;
    }
    public static void resign(Map<String,String> m) throws Exception {
        m.put("vnp_SecureHash",hmac(String.join("|",Arrays.stream(FIELDS).map(f->m.getOrDefault(f,"")).toList())));
    }
    VnPayGateway gateway(){return new VnPayGateway(true,"TEST1234",SECRET,"http://localhost:5196/subscription");}
    @Test void requestUsesQuerySignatureAndOriginalVietnamCreationTime() throws Exception {
        var body=gateway().queryRequest(UUID.fromString("00000000-0000-0000-0000-000000000001"),Instant.parse("2026-10-26T01:00:00Z"),Instant.parse("2026-10-26T01:10:00Z"),"127.0.0.1");
        assertEquals("20261026080000",body.get("vnp_TransactionDate"));assertEquals("20261026081000",body.get("vnp_CreateDate"));
        var values=new ArrayList<>(body.values());String hash=values.removeLast();assertEquals(hmac(String.join("|",values)),hash);
        assertNotEquals(body.get("vnp_RequestId"),gateway().queryRequest(UUID.randomUUID(),Instant.now(),Instant.now(),"127.0.0.1").get("vnp_RequestId"));
    }
    @Test void verifiedQueryRequiresSignedFieldsIncludingUnicodeAndPromotionFields() throws Exception {
        var response=signed(UUID.randomUUID(),Instant.now(),499000);assertTrue(gateway().verifiedQuery(response).isPresent());
        response.put("vnp_Amount","100");assertTrue(gateway().verifiedQuery(response).isEmpty());
        response.put("vnp_SecureHash","0".repeat(128));assertTrue(gateway().verifiedQuery(response).isEmpty());
        response.remove("vnp_SecureHash");assertTrue(gateway().verifiedQuery(response).isEmpty());
        assertTrue(gateway().verifiedQuery(Map.of("vnp_ResponseCode","00","vnp_TransactionStatus","00")).isEmpty());
    }
}
