package com.legacyvault.auth.emailverification;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Chính sách PS-116 đã duyệt (docs/api-contracts/email-verification.md, quyết định ngày 30/10/2026). Đường request
 * vẫn không dùng được cho đến khi bật gửi rõ ràng, nên không có job nào được xếp hàng mà không ai gửi.
 */
@Component
public class EmailVerificationConfiguration {
    // Một giới hạn tần suất: tối đa {max} lần trong {seconds} giây.
    public record Limit(int max,int seconds) { }

    private final boolean deliveryEnabled;
    private final int ttlMinutes;
    private final List<Limit> sendLimits;
    private final Limit confirmLimit;
    private final String verifyUrl;

    /**
     * Đọc cấu hình xác minh email và kiểm tra tính hợp lệ ngay khi khởi động (TTL > 0; nếu bật gửi thì verify-url phải hợp lệ).
     * Định dạng giới hạn là danh sách {@code max/giây} phân tách bằng dấu phẩy.
     */
    public EmailVerificationConfiguration(
            @Value("${legacyvault.auth.email-verification.delivery-enabled:false}") boolean deliveryEnabled,
            @Value("${legacyvault.auth.email-verification.ttl-minutes:1440}") int ttlMinutes,
            // Theo tài khoản: cooldown 60 giây, 3 lần/15 phút, 5 lần/24 giờ.
            @Value("${legacyvault.auth.email-verification.send-limits:1/60,3/900,5/86400}") String sendLimits,
            // Theo IP client, đếm theo mỗi lần confirm: 5 lần/15 phút.
            @Value("${legacyvault.auth.email-verification.confirm-limit:5/900}") String confirmLimit,
            @Value("${legacyvault.auth.email-verification.verify-url:}") String verifyUrl) {
        this.deliveryEnabled=deliveryEnabled; this.ttlMinutes=ttlMinutes; this.verifyUrl=verifyUrl;
        this.sendLimits=parse(sendLimits); this.confirmLimit=parse(confirmLimit).getFirst();
        if(ttlMinutes<=0) throw new IllegalArgumentException("Invalid email verification TTL");
        if(deliveryEnabled && !verifyUrlValid()) throw new IllegalArgumentException("Email verification URL is not allowed");
    }

    // RecoveryRateLimiter dọn sự kiện sau một ngày, nên cửa sổ dài hơn sẽ đếm thiếu mà không báo.
    private static List<Limit> parse(String spec) {
        List<Limit> limits=new ArrayList<>();
        for(String part:spec.split(",",-1)) {
            String[] pair=part.trim().split("/",-1);
            if(pair.length!=2) throw new IllegalArgumentException("Invalid email verification limit");
            Limit limit=new Limit(Integer.parseInt(pair[0].trim()),Integer.parseInt(pair[1].trim()));
            if(limit.max()<=0 || limit.seconds()<=0 || limit.seconds()>86400) throw new IllegalArgumentException("Invalid email verification limit");
            limits.add(limit);
        }
        return List.copyOf(limits);
    }

    /** Chỉ chấp nhận https://<host>/verify-email, hoặc origin dev của Vite; không có gì lấy từ client. */
    // Chống open-redirect/phishing: link xác minh chỉ lấy từ cấu hình máy chủ, chỉ chấp nhận https hoặc origin dev của Vite.
    public boolean verifyUrlValid() {
        try {
            URI uri=URI.create(verifyUrl);
            boolean local="http".equals(uri.getScheme()) && "localhost".equals(uri.getHost()) && uri.getPort()==5173;
            boolean https="https".equals(uri.getScheme()) && uri.getHost()!=null;
            return (local||https) && "/verify-email".equals(uri.getPath())
                    && uri.getRawQuery()==null && uri.getRawFragment()==null && uri.getUserInfo()==null;
        } catch(IllegalArgumentException e) { return false; }
    }

    /** Request chỉ được nhận khi có worker thực sự gửi được. Xác nhận credential đã cấp không bao giờ phụ thuộc vào điều này. */
    public boolean ready() { return deliveryEnabled; }
    public int ttlMinutes() { return ttlMinutes; }
    public List<Limit> sendLimits() { return sendLimits; }
    public Limit confirmLimit() { return confirmLimit; }
    // Credential nằm trong fragment (#token=) nên không bị gửi lên server hay ghi vào log truy cập.
    public String link(String credential) { return verifyUrl+"#token="+credential; }
}
