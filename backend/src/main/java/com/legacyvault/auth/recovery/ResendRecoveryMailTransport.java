package com.legacyvault.auth.recovery;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

/**
 * Cài đặt {@link RecoveryMailTransport} gửi mail qua API Resend ({@code https://api.resend.com/emails}). Cũng được email xác minh
 * dùng chung qua {@link #sendMessage}.
 */
@Component
public class ResendRecoveryMailTransport implements RecoveryMailTransport {
    /**
     * Cấu hình nhà cung cấp, người gửi và allowlist.
     */
    private final RecoveryConfiguration config;
    /**
     * Tuần tự hóa body JSON.
     */
    private final ObjectMapper json;
    /**
     * HTTP client (timeout kết nối 5 giây, không theo redirect).
     */
    private final HttpClient client;
    /**
     * Constructor chính do Spring dùng; tạo HttpClient không theo redirect.
     *
     * @param config cấu hình
     * @param json   ObjectMapper
     */
    @org.springframework.beans.factory.annotation.Autowired
    public ResendRecoveryMailTransport(RecoveryConfiguration config, ObjectMapper json) {
        this(config,json,HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER).build());
    }
    /**
     * Constructor cho test, cho phép tiêm HttpClient giả.
     */
    ResendRecoveryMailTransport(RecoveryConfiguration config,ObjectMapper json,HttpClient client) {
        this.config=config; this.json=json; this.client=client;
    }
    /**
     * Gửi email khôi phục (tiêu đề và nội dung theo locale, nêu liên kết hết hạn sau 15 phút).
     *
     * @throws IllegalStateException nếu cấu hình chưa sẵn sàng hoặc gửi thất bại
     */
    @Override public void send(String recipient, String locale, String credential) {
        if(!config.ready()) throw new IllegalStateException("Recovery delivery unavailable");
        boolean en="en".equals(locale);
        sendMessage(recipient,en?"Reset your LegacyVault password":"Đặt lại mật khẩu LegacyVault",
                (en?"This link expires in 15 minutes. If you did not request it, ignore this email.\n":"Liên kết hết hạn sau 15 phút. Bỏ qua email nếu bạn không yêu cầu.\n")+config.link(credential));
    }
    /**
     * Điểm gọi Resend duy nhất, cũng dùng cho PS-116: endpoint cố định, không theo redirect, bắt buộc người nhận nằm trong
     * allowlist. POST JSON {@code from/to/subject/text} với Bearer API key, timeout 10 giây.
     *
     * @param recipient địa chỉ nhận
     * @param subject   tiêu đề
     * @param text      nội dung văn bản
     * @throws IllegalStateException nếu chưa cấu hình, người nhận không được phép, bị ngắt hoặc nhà cung cấp trả lỗi (thông báo
     *         cố ý chung chung để không lộ URL/header)
     */
    public void sendMessage(String recipient, String subject, String text) {
        if(!config.providerReady() || !config.permits(recipient)) throw new IllegalStateException("Recovery delivery unavailable");
        try {
            String body=json.writeValueAsString(Map.of("from",config.sender(),"to",List.of(recipient),"subject",subject,"text",text));
            var request=HttpRequest.newBuilder(URI.create("https://api.resend.com/emails"))
                    .timeout(Duration.ofSeconds(10)).header("Authorization","Bearer "+config.apiKey())
                    .header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(body)).build();
            var response=client.send(request,HttpResponse.BodyHandlers.discarding());
            if(response.statusCode()<200 || response.statusCode()>=300) throw new IllegalStateException("Recovery delivery unavailable");
        } catch(InterruptedException e) {
            Thread.currentThread().interrupt(); throw new IllegalStateException("Recovery delivery interrupted");
        } catch(Exception e) {
            // No cause: provider/network exceptions can contain request URLs, bodies and headers.
            throw new IllegalStateException("Recovery delivery unavailable");
        }
    }
}
