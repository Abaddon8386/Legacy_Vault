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

@Component
public class ResendRecoveryMailTransport implements RecoveryMailTransport {
    private final RecoveryConfiguration config;
    private final ObjectMapper json;
    private final HttpClient client;
    @org.springframework.beans.factory.annotation.Autowired
    public ResendRecoveryMailTransport(RecoveryConfiguration config, ObjectMapper json) {
        this(config,json,HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER).build());
    }
    ResendRecoveryMailTransport(RecoveryConfiguration config,ObjectMapper json,HttpClient client) {
        this.config=config; this.json=json; this.client=client;
    }
    @Override public void send(String recipient, String locale, String credential) {
        if(!config.ready() || !config.permits(recipient)) throw new IllegalStateException("Recovery delivery unavailable");
        boolean en="en".equals(locale);
        try {
            String body=json.writeValueAsString(Map.of("from",config.sender(),"to",List.of(recipient),
                    "subject",en?"Reset your LegacyVault password":"Đặt lại mật khẩu LegacyVault",
                    "text",(en?"This link expires in 15 minutes. If you did not request it, ignore this email.\n":"Liên kết hết hạn sau 15 phút. Bỏ qua email nếu bạn không yêu cầu.\n")+config.link(credential)));
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
