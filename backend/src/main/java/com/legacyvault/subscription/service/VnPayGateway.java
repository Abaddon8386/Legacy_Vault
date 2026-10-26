package com.legacyvault.subscription.service;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.MultiValueMap;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

/** VNPay PAY 2.1.0 sandbox only. Never logs secrets or callback query strings. */
@Component
public class VnPayGateway {
    public static final String CHECKOUT = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("uuuuMMddHHmmss")
            .withZone(ZoneId.of("Asia/Ho_Chi_Minh"));
    private final boolean enabled;
    private final String merchant, secret, returnUrl;
    public VnPayGateway(@Value("${legacyvault.vnpay.enabled:false}") boolean enabled,
            @Value("${legacyvault.vnpay.merchant-code:}") String merchant,
            @Value("${legacyvault.vnpay.hash-secret:}") String secret,
            @Value("${legacyvault.vnpay.return-url:}") String returnUrl) {
        this.enabled=enabled; this.merchant=merchant; this.secret=secret; this.returnUrl=returnUrl;
        if(enabled && !configured()) throw new IllegalStateException("VNPay sandbox configuration is incomplete");
    }
    private boolean configured() {
        try {
            URI uri=URI.create(returnUrl);
            return merchant.matches("[A-Z0-9]{8}") && secret.length()>=16 && returnUrl.length()<=255
                && uri.getHost()!=null && uri.getUserInfo()==null && uri.getFragment()==null && uri.getQuery()==null
                && ("https".equals(uri.getScheme()) || ("http".equals(uri.getScheme())
                    && Set.of("localhost","127.0.0.1").contains(uri.getHost())));
        } catch(IllegalArgumentException e) { return false; }
    }
    public boolean available() { return enabled && configured(); }
    public String merchant() { return merchant; }
    private static final List<String> QUERY_RESPONSE_FIELDS = List.of("vnp_ResponseId", "vnp_Command",
        "vnp_ResponseCode", "vnp_Message", "vnp_TmnCode", "vnp_TxnRef", "vnp_Amount", "vnp_BankCode",
        "vnp_PayDate", "vnp_TransactionNo", "vnp_TransactionType", "vnp_TransactionStatus", "vnp_OrderInfo",
        "vnp_PromotionCode", "vnp_PromotionAmount");

    /** QueryDR uses pipe-delimited UTF-8, not the URL-encoded checkout/IPN signature format. */
    public Map<String,String> queryRequest(UUID paymentId, Instant created, Instant now, String serverIp) {
        requireAvailable();
        var fields = new LinkedHashMap<String,String>();
        fields.put("vnp_RequestId", UUID.randomUUID().toString().replace("-", ""));
        fields.put("vnp_Version", "2.1.0"); fields.put("vnp_Command", "querydr");
        fields.put("vnp_TmnCode", merchant); fields.put("vnp_TxnRef", paymentId.toString().replace("-", ""));
        fields.put("vnp_TransactionDate", DATE.format(created)); fields.put("vnp_CreateDate", DATE.format(now));
        fields.put("vnp_IpAddr", serverIp); fields.put("vnp_OrderInfo", "Query LegacyVault payment");
        fields.put("vnp_SecureHash", signText(String.join("|", fields.values()), StandardCharsets.UTF_8));
        return Collections.unmodifiableMap(fields);
    }

    public Optional<Map<String,String>> verifiedQuery(Map<?,?> response) {
        if (!available() || response == null || response.size() > 32) return Optional.empty();
        var fields = new LinkedHashMap<String,String>();
        for (String field : QUERY_RESPONSE_FIELDS) {
            Object value = response.get(field);
            if (value != null && !(value instanceof String)) return Optional.empty();
            String text = value == null ? "" : (String)value;
            if (text.length() > 512) return Optional.empty();
            fields.put(field, text);
        }
        Object received = response.get("vnp_SecureHash");
        if (!(received instanceof String hash) || !hash.matches("[a-fA-F0-9]{128}")) return Optional.empty();
        String expected = signText(String.join("|", fields.values()), StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(HexFormat.of().parseHex(hash), HexFormat.of().parseHex(expected))) return Optional.empty();
        return Optional.of(Collections.unmodifiableMap(fields));
    }
    public void requireAvailable() {
        if(!available()) throw new BusinessException(ErrorCode.SUBSCRIPTION_UPGRADE_UNAVAILABLE);
    }
    public String checkout(UUID id,long amount,Instant created,Instant expires,String ip) {
        requireAvailable();
        var fields=new TreeMap<String,String>();
        fields.put("vnp_Version","2.1.0"); fields.put("vnp_Command","pay");
        fields.put("vnp_TmnCode",merchant); fields.put("vnp_Amount",Long.toString(Math.multiplyExact(amount,100)));
        fields.put("vnp_CurrCode","VND"); fields.put("vnp_Locale","vn"); fields.put("vnp_OrderType","other");
        fields.put("vnp_TxnRef",id.toString().replace("-","")); fields.put("vnp_OrderInfo","LegacyVault " + id.toString().replace("-",""));
        fields.put("vnp_CreateDate",DATE.format(created)); fields.put("vnp_ExpireDate",DATE.format(expires));
        fields.put("vnp_ReturnUrl",returnUrl); fields.put("vnp_IpAddr",ip);
        return CHECKOUT+"?"+canonical(fields)+"&vnp_SecureHash="+sign(fields);
    }
    public Optional<Map<String,String>> verified(MultiValueMap<String,String> query) {
        if(!available() || query.size()>32) return Optional.empty();
        var fields=new TreeMap<String,String>();
        for(var entry:query.entrySet()) {
            if(!entry.getKey().matches("vnp_[A-Za-z0-9]{1,40}") || entry.getValue().size()!=1) return Optional.empty();
            String value=entry.getValue().getFirst();
            if(value==null || value.length()>512) return Optional.empty();
            if(!value.isEmpty()) fields.put(entry.getKey(),value);
        }
        String hash=fields.remove("vnp_SecureHash");
        fields.remove("vnp_SecureHashType");
        if(hash==null || !hash.matches("[a-fA-F0-9]{128}")) return Optional.empty();
        return MessageDigest.isEqual(HexFormat.of().parseHex(hash),HexFormat.of().parseHex(sign(fields)))
            ? Optional.of(Collections.unmodifiableMap(fields)) : Optional.empty();
    }
    public String sign(Map<String,String> fields) {
        return signText(canonical(fields), StandardCharsets.US_ASCII);
    }
    private String signText(String text, java.nio.charset.Charset charset) {
        try {
            Mac mac=Mac.getInstance("HmacSHA512");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA512"));
            return HexFormat.of().formatHex(mac.doFinal(text.getBytes(charset)));
        } catch(java.security.GeneralSecurityException e) { throw new IllegalStateException("HMAC unavailable",e); }
    }
    static String canonical(Map<String,String> fields) {
        return new TreeMap<>(fields).entrySet().stream().filter(e->e.getValue()!=null && !e.getValue().isEmpty())
            .map(e->encode(e.getKey())+"="+encode(e.getValue())).collect(Collectors.joining("&"));
    }
    private static String encode(String text) { return URLEncoder.encode(text,StandardCharsets.US_ASCII); }
}
