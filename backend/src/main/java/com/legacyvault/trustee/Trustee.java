package com.legacyvault.trustee;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import com.legacyvault.vault.Vault;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "trustees", schema = "dbo")
public class Trustee {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "trustee_id")
	private Long id;

	@Column(name = "public_id", nullable = false, updatable = false)
	private UUID publicId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "vault_id", nullable = false)
	private Vault vault;

	@Column(name = "full_name", nullable = false, length = 150)
	private String fullName;

	@Column(name = "phone_number", length = 20)
	private String phone;

	@Column(name = "email", length = 254)
	private String email;

	@Column(name = "relationship_to_owner", length = 100)
	private String relationship;

	@Column(name = "note", length = 500)
	private String note;

	@Column(name = "status", nullable = false, length = 20)
	private String status;

	@Column(name = "appointed_at", nullable = false)
	private LocalDateTime appointedAt;

	@Column(name = "revoked_at")
	private LocalDateTime revokedAt;

	@Column(name = "updated_at", nullable = false)
	private LocalDateTime updatedAt;

	protected Trustee() {
	}

	public Trustee(Vault vault, String fullName, String phone, String email, String relationship, String note) {
		this.vault = vault;
		this.fullName = fullName;
		this.phone = phone;
		this.email = email;
		this.relationship = relationship;
		this.note = note;
		this.status = "APPOINTED";
	}

	@PrePersist
	void onCreate() {
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		if (publicId == null) publicId = UUID.randomUUID();
		if (appointedAt == null) appointedAt = now;
		if (updatedAt == null) updatedAt = now;
	}

	@PreUpdate
	void onUpdate() {
		updatedAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	public void update(String fullName, String phone, String email, String relationship, String note) {
		this.fullName = fullName;
		this.phone = phone;
		this.email = email;
		this.relationship = relationship;
		this.note = note;
	}

	public void revoke(LocalDateTime at) {
		this.status = "REVOKED";
		this.revokedAt = at;
	}

	public Long getId() { return id; }
	public UUID getPublicId() { return publicId; }
	public Vault getVault() { return vault; }
	public String getFullName() { return fullName; }
	public String getPhone() { return phone; }
	public String getEmail() { return email; }
	public String getRelationship() { return relationship; }
	public String getNote() { return note; }
	public String getStatus() { return status; }
	public LocalDateTime getAppointedAt() { return appointedAt; }
	public LocalDateTime getUpdatedAt() { return updatedAt; }
}
