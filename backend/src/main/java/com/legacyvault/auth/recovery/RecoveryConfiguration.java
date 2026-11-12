package com.legacyvault.auth.recovery;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Cấu hình email khôi phục mật khẩu, đọc từ {@code legacyvault.auth.recovery.*} (email-enabled, resend-api-key, sender,
 * reset-url, recipient-allowlist). Cũng được dùng chung cho email xác minh (PS-116). Nếu bật mà cấu hình thiếu thì
 * ném lỗi khi khởi động.
 */
@Component
public class RecoveryConfiguration {
    /**
     * Cờ bật gửi email khôi phục.
     */
    private final boolean enabled;
    /**
     * API key của Resend.
     */
    private final String apiKey;
    /**
     * Địa chỉ người gửi.
     */
    private final String sender;
    /**
     * URL trang đặt lại mật khẩu của frontend (ghép mã vào fragment).
     */
    private final String resetUrl;
    /**
     * Danh sách email được phép nhận (allowlist, đã chuẩn hóa).
     */
    private final java.util.Set<String> recipients;
    /**
     * @throws IllegalArgumentException nếu {@code enabled} nhưng cấu hình chưa đầy đủ
     */
    public RecoveryConfiguration(@Value("${legacyvault.auth.recovery.email-enabled:false}") boolean enabled,
            @Value("${legacyvault.auth.recovery.resend-api-key:}") String apiKey,
            @Value("${legacyvault.auth.recovery.sender:}") String sender,
            @Value("${legacyvault.auth.recovery.reset-url:}") String resetUrl,
            @Value("${legacyvault.auth.recovery.recipient-allowlist:}") String allowlist) {
        this.enabled=enabled; this.apiKey=apiKey; this.sender=sender; this.resetUrl=resetUrl;
        recipients=java.util.Arrays.stream(allowlist.split(",")).map(com.legacyvault.auth.EmailNormalizer::normalize)
                .filter(s->!s.isBlank()).collect(java.util.stream.Collectors.toUnmodifiableSet());
        if(enabled && !ready()) throw new IllegalArgumentException("Recovery email configuration incomplete");
    }
    /**
     * Nhà cung cấp mail đã sẵn sàng: có API key, sender hợp lệ (không chứa xuống dòng) và allowlist không rỗng. Dùng chung với email
     * xác minh PS-116.
     *
     * @return {@code true} nếu đủ điều kiện gửi
     */
    public boolean providerReady() {
        return !apiKey.isBlank() && !sender.isBlank() && !recipients.isEmpty() && !sender.contains("\r") && !sender.contains("\n");
    }
    /**
     * Tính năng khôi phục sẵn sàng: bật, nhà cung cấp sẵn sàng và {@code reset-url} hợp lệ (http://localhost:5173 hoặc https,
     * đường dẫn {@code /reset-password}, không query/fragment/userinfo).
     *
     * @return {@code true} nếu sẵn sàng
     */
    public boolean ready() {
        if(!enabled || !providerReady()) return false;
        try {
            URI uri=URI.create(resetUrl);
            boolean local="http".equals(uri.getScheme()) && "localhost".equals(uri.getHost()) && uri.getPort()==5173;
            boolean https="https".equals(uri.getScheme()) && uri.getHost()!=null;
            return (local||https) && "/reset-password".equals(uri.getPath())
                    && uri.getRawQuery()==null && uri.getRawFragment()==null && uri.getUserInfo()==null;
        } catch(IllegalArgumentException e) { return false; }
    }
    /**
     * API key của Resend.
     */
    public String apiKey() { return apiKey; }
    /**
     * Địa chỉ người gửi.
     */
    public String sender() { return sender; }
    /**
     * Kiểm tra email có nằm trong allowlist nhận mail không.
     *
     * @param email email người nhận
     * @return {@code true} nếu được phép
     */
    public boolean permits(String email) { return recipients.contains(com.legacyvault.auth.EmailNormalizer.normalize(email)); }
    /**
     * Tạo liên kết đặt lại mật khẩu; mã đặt trong fragment {@code #token=} để không gửi lên server qua query.
     *
     * @param credential mã khôi phục
     * @return URL đầy đủ
     */
    public String link(String credential) { return resetUrl+"#token="+credential; }
}
