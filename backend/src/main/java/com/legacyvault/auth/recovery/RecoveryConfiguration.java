package com.legacyvault.auth.recovery;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class RecoveryConfiguration {
    private final boolean enabled;
    private final String apiKey;
    private final String sender;
    private final String resetUrl;
    private final java.util.Set<String> recipients;
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
    /** Provider credentials, sender and recipient allowlist only; shared with PS-116 verification mail. */
    public boolean providerReady() {
        return !apiKey.isBlank() && !sender.isBlank() && !recipients.isEmpty() && !sender.contains("\r") && !sender.contains("\n");
    }
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
    public String apiKey() { return apiKey; }
    public String sender() { return sender; }
    public boolean permits(String email) { return recipients.contains(com.legacyvault.auth.EmailNormalizer.normalize(email)); }
    public String link(String credential) { return resetUrl+"#token="+credential; }
}
