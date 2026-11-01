package com.legacyvault.auth.emailverification;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Approved PS-116 policy (docs/api-contracts/email-verification.md, decisions of 30/10/2026). The request path
 * stays unavailable until delivery is explicitly enabled, so no job is queued that nobody will ever send.
 */
@Component
public class EmailVerificationConfiguration {
    public record Limit(int max,int seconds) { }

    private final boolean deliveryEnabled;
    private final int ttlMinutes;
    private final List<Limit> sendLimits;
    private final Limit confirmLimit;
    private final String verifyUrl;

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

    // RecoveryRateLimiter prunes events after one day, so a longer window would silently undercount.
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

    /** Only https://<host>/verify-email, or the Vite dev origin; nothing comes from the client. */
    public boolean verifyUrlValid() {
        try {
            URI uri=URI.create(verifyUrl);
            boolean local="http".equals(uri.getScheme()) && "localhost".equals(uri.getHost()) && uri.getPort()==5173;
            boolean https="https".equals(uri.getScheme()) && uri.getHost()!=null;
            return (local||https) && "/verify-email".equals(uri.getPath())
                    && uri.getRawQuery()==null && uri.getRawFragment()==null && uri.getUserInfo()==null;
        } catch(IllegalArgumentException e) { return false; }
    }

    /** Requests are accepted only when a worker can actually send them. Confirming an issued credential never depends on this. */
    public boolean ready() { return deliveryEnabled; }
    public int ttlMinutes() { return ttlMinutes; }
    public List<Limit> sendLimits() { return sendLimits; }
    public Limit confirmLimit() { return confirmLimit; }
    public String link(String credential) { return verifyUrl+"#token="+credential; }
}
