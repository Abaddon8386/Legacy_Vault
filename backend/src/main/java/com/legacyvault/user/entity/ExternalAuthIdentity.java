package com.legacyvault.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/** Explicit provider/subject mapping. Account-linking authorization is enforced by the auth service. */
@Entity
@Table(name = "external_auth_identities", schema = "dbo")
public class ExternalAuthIdentity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "external_auth_identity_id")
    private Long id;

    @Column(name = "provider_code", nullable = false, length = 30)
    private String providerCode;

    @Column(name = "subject", nullable = false, length = 255)
    private String subject;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected ExternalAuthIdentity() {
    }

    public ExternalAuthIdentity(String providerCode, String subject, User user) {
        this.providerCode = providerCode;
        this.subject = subject;
        this.user = user;
    }

    public Long getId() { return id; }
    public String getProviderCode() { return providerCode; }
    public String getSubject() { return subject; }
    public User getUser() { return user; }
}
