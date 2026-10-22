package com.legacyvault.beneficiary;

import com.legacyvault.auth.EmailNormalizer;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class InvitationMailConfiguration {
    private final boolean enabled;
    private final String apiKey, sender;
    private final Set<String> recipients;
    public InvitationMailConfiguration(@Value("${legacyvault.invitation-mail.enabled:false}") boolean enabled,
            @Value("${legacyvault.invitation-mail.resend-api-key:}") String apiKey,
            @Value("${legacyvault.invitation-mail.sender:}") String sender,
            @Value("${legacyvault.invitation-mail.recipient-allowlist:}") String allowlist) {
        this.enabled=enabled; this.apiKey=apiKey; this.sender=sender;
        recipients=Arrays.stream(allowlist.split(",")).map(EmailNormalizer::normalize)
                .filter(value->!value.isBlank()).collect(Collectors.toUnmodifiableSet());
        if(enabled && !ready()) throw new IllegalArgumentException("Invitation email configuration incomplete");
    }
    public boolean ready() { return enabled && !apiKey.isBlank() && !sender.isBlank() && !recipients.isEmpty()
            && !sender.contains("\r") && !sender.contains("\n"); }
    public boolean permits(String email) { return ready() && email!=null && recipients.contains(EmailNormalizer.normalize(email)); }
    public String transportStatus() { return ready()?"ENABLED":"DISABLED"; }
    public String apiKey() { return apiKey; }
    public String sender() { return sender; }
}
