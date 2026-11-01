package com.legacyvault.auth.emailverification;

/**
 * Delivery boundary for the verification credential. No production implementation exists yet: link-vs-code,
 * redirect allowlist and provider settings are unapproved. Implementations must treat a normal return as
 * "provider accepted" only, and must never log the recipient, credential or message body.
 */
public interface EmailVerificationMailTransport {
    void send(String recipient, String locale, String credential);
}
