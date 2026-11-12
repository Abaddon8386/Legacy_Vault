package com.legacyvault.auth.emailverification;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Cấu hình xác minh email (PS-116), theo chính sách đã duyệt ngày 30/10/2026 (docs/api-contracts/email-verification.md).
 * Đường gửi yêu cầu chỉ khả dụng khi việc gửi mail được bật rõ ràng, để không xếp hàng job mà không ai gửi. Đọc từ
 * {@code legacyvault.auth.email-verification.*} (delivery-enabled, ttl-minutes, send-limits, confirm-limit, verify-url).
 */
@Component
public class EmailVerificationConfiguration {
    /**
     * Một hạn mức tốc độ.
     *
     * @param max     số lần tối đa
     * @param seconds độ dài cửa sổ (giây)
     */
    public record Limit(int max,int seconds) { }

    /**
     * Cờ bật gửi email xác minh.
     */
    private final boolean deliveryEnabled;
    /**
     * Thời hạn của mã xác minh (phút), mặc định 1440 (24 giờ).
     */
    private final int ttlMinutes;
    /**
     * Các hạn mức gửi yêu cầu theo tài khoản (cooldown 60 giây, 3/15 phút, 5/24 giờ).
     */
    private final List<Limit> sendLimits;
    /**
     * Hạn mức xác nhận theo IP (5 lần/15 phút).
     */
    private final Limit confirmLimit;
    /**
     * URL trang xác minh email của frontend (mã đặt trong fragment).
     */
    private final String verifyUrl;

    /**
     * @param deliveryEnabled bật gửi mail
     * @param ttlMinutes     thời hạn mã (phút)
     * @param sendLimits     danh sách dạng {@code max/giây}, phân tách bằng dấu phẩy
     * @param confirmLimit   hạn mức xác nhận dạng {@code max/giây}
     * @param verifyUrl      URL xác minh cố định
     * @throws IllegalArgumentException nếu TTL không dương, hạn mức sai, hoặc bật gửi mà URL không hợp lệ
     */
    public EmailVerificationConfiguration(
            @Value("${legacyvault.auth.email-verification.delivery-enabled:false}") boolean deliveryEnabled,
            @Value("${legacyvault.auth.email-verification.ttl-minutes:1440}") int ttlMinutes,
            // Per account: 60 s cooldown, 3 per 15 min, 5 per 24 h.
            @Value("${legacyvault.auth.email-verification.send-limits:1/60,3/900,5/86400}") String sendLimits,
            // Per client IP, counted per confirm attempt: 5 per 15 min.
            @Value("${legacyvault.auth.email-verification.confirm-limit:5/900}") String confirmLimit,
            @Value("${legacyvault.auth.email-verification.verify-url:}") String verifyUrl) {
        this.deliveryEnabled=deliveryEnabled; this.ttlMinutes=ttlMinutes; this.verifyUrl=verifyUrl;
        this.sendLimits=parse(sendLimits); this.confirmLimit=parse(confirmLimit).getFirst();
        if(ttlMinutes<=0) throw new IllegalArgumentException("Invalid email verification TTL");
        if(deliveryEnabled && !verifyUrlValid()) throw new IllegalArgumentException("Email verification URL is not allowed");
    }

    /**
     * Phân tích chuỗi hạn mức {@code max/giây,...}. Cửa sổ tối đa 1 ngày vì {@code PasswordRecoveryService.cleanup} xóa sự kiện của {@code RecoveryRateLimiter} sau một ngày,
     * cửa sổ dài hơn sẽ đếm thiếu.
     *
     * @param spec chuỗi cấu hình
     * @return danh sách hạn mức bất biến
     * @throws IllegalArgumentException nếu sai định dạng hoặc ngoài khoảng cho phép
     */
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

    /**
     * Chỉ chấp nhận {@code https://host/verify-email} hoặc origin dev của Vite (http://localhost:5173), không query, fragment hay
     * userinfo; không có phần nào lấy từ client.
     *
     * @return {@code true} nếu URL hợp lệ
     */
    public boolean verifyUrlValid() {
        try {
            URI uri=URI.create(verifyUrl);
            boolean local="http".equals(uri.getScheme()) && "localhost".equals(uri.getHost()) && uri.getPort()==5173;
            boolean https="https".equals(uri.getScheme()) && uri.getHost()!=null;
            return (local||https) && "/verify-email".equals(uri.getPath())
                    && uri.getRawQuery()==null && uri.getRawFragment()==null && uri.getUserInfo()==null;
        } catch(IllegalArgumentException e) { return false; }
    }

    /**
     * Chỉ nhận yêu cầu khi có worker thực sự gửi được. Việc xác nhận một mã đã phát hành không phụ thuộc cờ này.
     *
     * @return {@code true} nếu bật gửi mail
     */
    public boolean ready() { return deliveryEnabled; }
    /**
     * Thời hạn mã (phút).
     */
    public int ttlMinutes() { return ttlMinutes; }
    /**
     * Các hạn mức gửi yêu cầu theo tài khoản.
     */
    public List<Limit> sendLimits() { return sendLimits; }
    /**
     * Hạn mức xác nhận theo IP.
     */
    public Limit confirmLimit() { return confirmLimit; }
    /**
     * Tạo liên kết xác minh với mã trong fragment {@code #token=}.
     *
     * @param credential mã xác minh
     * @return URL đầy đủ
     */
    public String link(String credential) { return verifyUrl+"#token="+credential; }
}
