package com.legacyvault.auth.emailverification;

import com.legacyvault.auth.recovery.ResendRecoveryMailTransport;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Verification message over the existing Resend call (provider key, sender and approved-recipient allowlist are
 * shared with recovery). Returning normally means provider acceptance only. Never log recipient, link or body.
 */
@Component
@ConditionalOnProperty(name="legacyvault.auth.email-verification.delivery-enabled",havingValue="true")
public class ResendEmailVerificationMailTransport implements EmailVerificationMailTransport {
    private final EmailVerificationConfiguration config;
    private final ResendRecoveryMailTransport resend;
    public ResendEmailVerificationMailTransport(EmailVerificationConfiguration config,ResendRecoveryMailTransport resend) {
        this.config=config; this.resend=resend;
    }
    @Override public void send(String recipient,String locale,String credential) {
        boolean en="en".equals(locale);
        long hours=Math.max(1,config.ttlMinutes()/60);
        resend.sendMessage(recipient,en?"Verify your LegacyVault email":"Xác minh email LegacyVault",
                (en?"This link expires in "+hours+" hours. If you did not request it, ignore this email.\n"
                    :"Liên kết hết hạn sau "+hours+" giờ. Bỏ qua email nếu bạn không yêu cầu.\n")+config.link(credential));
    }
}
