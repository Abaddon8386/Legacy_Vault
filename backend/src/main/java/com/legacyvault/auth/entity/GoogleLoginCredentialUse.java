package com.legacyvault.auth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import org.springframework.data.domain.Persistable;

import java.time.LocalDateTime;

/** One-time use marker for a verified Google ID token; persists only its SHA-256 fingerprint. */
@Entity
@Table(name = "google_login_credential_uses", schema = "dbo")
public class GoogleLoginCredentialUse implements Persistable<String> {
    @Id
    @Column(name = "credential_hash", nullable = false, length = 64)
    private String credentialHash;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Transient
    private boolean newEntity = true;

    protected GoogleLoginCredentialUse() {
    }

    public GoogleLoginCredentialUse(String credentialHash, LocalDateTime expiresAt) {
        this.credentialHash = credentialHash;
        this.expiresAt = expiresAt;
    }

    @Override
    public String getId() {
        return credentialHash;
    }

    @Override
    @Transient
    public boolean isNew() {
        return newEntity;
    }

    @PostPersist
    private void markPersisted() {
        newEntity = false;
    }

    @PostLoad
    private void markLoaded() {
        newEntity = false;
    }
}
