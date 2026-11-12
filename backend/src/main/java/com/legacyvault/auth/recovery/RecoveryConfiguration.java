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
    private final String redirectTo;
    private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(RecoveryConfiguration.class);
    public RecoveryConfiguration(boolean enabled,String apiKey,String sender,String resetUrl,String allowlist) {
        this(enabled,apiKey,sender,resetUrl,allowlist,"");
    }
    @org.springframework.beans.factory.annotation.Autowired
    public RecoveryConfiguration(@Value("${legacyvault.auth.recovery.email-enabled:false}") boolean enabled,
            @Value("${legacyvault.auth.recovery.resend-api-key:}") String apiKey,
            @Value("${legacyvault.auth.recovery.sender:}") String sender,
            @Value("${legacyvault.auth.recovery.reset-url:}") String resetUrl,
            @Value("${legacyvault.auth.recovery.recipient-allowlist:}") String allowlist,
            @Value("${legacyvault.auth.recovery.redirect-to:}") String redirectTo) {
        this.enabled=enabled; this.apiKey=apiKey; this.sender=sender; this.resetUrl=resetUrl;
        this.redirectTo=com.legacyvault.auth.EmailNormalizer.normalize(redirectTo==null?"":redirectTo);
        if(!this.redirectTo.isEmpty() && !this.redirectTo.matches("[^\\s@,<>\"]+@[^\\s@,<>\"]+")) {
            throw new IllegalArgumentException("Recovery redirect address is invalid");
        }
        var approved=new java.util.HashSet<String>(java.util.Arrays.stream(allowlist.split(",")).map(com.legacyvault.auth.EmailNormalizer::normalize)
                .filter(s->!s.isBlank()).toList());
        // The redirect target is the only real recipient, so it is approved implicitly.
        if(!this.redirectTo.isEmpty()) approved.add(this.redirectTo);
        recipients=java.util.Collections.unmodifiableSet(approved);
        if(!this.redirectTo.isEmpty()) LOG.warn("Recovery mail redirect is ON: every recovery and verification email goes to one fixed address. Demo/test only.");
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
    /** Real mailbox for an account email: the fixed redirect address when set (demo/test), otherwise the account email itself. */
    public String deliveryAddress(String accountEmail) { return redirectTo.isEmpty()?accountEmail:redirectTo; }
    public boolean redirected() { return !redirectTo.isEmpty(); }
    public boolean permits(String email) { return recipients.contains(com.legacyvault.auth.EmailNormalizer.normalize(email)); }
    public String link(String credential) { return resetUrl+"#token="+credential; }
}
