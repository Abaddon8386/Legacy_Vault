package com.legacyvault.auth.recovery;

public interface RecoveryMailTransport {
    /** Provider acceptance only; not proof of inbox delivery. Never log recipient, URL or body. */
    void send(String recipient, String locale, String credential);
}
