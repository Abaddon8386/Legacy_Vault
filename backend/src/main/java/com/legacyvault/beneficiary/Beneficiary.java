package com.legacyvault.beneficiary;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import com.legacyvault.vault.entity.Vault;

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
@Table(name = "beneficiaries", schema = "dbo")
public class Beneficiary {

	public static final String NOT_VERIFIED = "NOT_VERIFIED";
	public static final String VERIFIED_AT_COUNTER = "VERIFIED_AT_COUNTER";
	public static final String ACCOUNT_NOT_CREATED = "NOT_CREATED";
	public static final String ACCOUNT_CREATED = "ACCOUNT_CREATED";
	public static final String ORIGIN_OWNER_DESIGNATED = "OWNER_DESIGNATED";
	/** BE-02: recipient named only by a Legal-reviewed court document (D-LEGAL-002), not by the Owner. */
	public static final String ORIGIN_COURT_DOCUMENT = "COURT_DOCUMENT";

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "beneficiary_id")
	private Long id;

	@Column(name = "public_id", nullable = false, updatable = false)
	private UUID publicId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "vault_id", nullable = false)
	private Vault vault;

	@Column(name = "linked_user_id")
	private Long linkedUserId;

	@Column(name = "full_name", nullable = false, length = 150)
	private String fullName;

	@Column(name = "email", length = 254)
	private String email;

	@Column(name = "phone_number", length = 20)
	private String phone;

	@Column(name = "identity_document_type", length = 30)
	private String identityDocumentType;

	@Column(name = "identity_document_no_encrypted", length = 512)
	private byte[] identityNumberEncrypted;

	@Column(name = "designation_status", nullable = false, length = 20)
	private String status;

	@Column(name = "id_verification_status", nullable = false, length = 30)
	private String identityVerificationStatus = NOT_VERIFIED;

	@Column(name = "account_status", nullable = false, length = 30)
	private String accountStatus = ACCOUNT_NOT_CREATED;

	@Column(name = "created_at", nullable = false)
	private LocalDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private LocalDateTime updatedAt;

	@Column(name = "date_of_birth")
	private LocalDate dateOfBirth;

	@Column(name = "relationship_to_owner", length = 100)
	private String relationship;

	@Column(name = "origin", nullable = false, updatable = false, length = 30)
	private String origin = ORIGIN_OWNER_DESIGNATED;

	@Column(name = "origin_dossier_version_id", updatable = false)
	private Long originDossierVersionId;

	protected Beneficiary() {
	}

	/** BE-02: a recipient created at ST-18 from the court document version that names them. */
	public static Beneficiary fromCourtDocument(UUID publicId, Vault vault, Long dossierVersionId, String fullName,
			String relationship, LocalDate dateOfBirth, String phone, String email, byte[] identityNumberEncrypted) {
		if (dossierVersionId == null) throw new IllegalArgumentException("dossierVersionId");
		Beneficiary beneficiary = new Beneficiary(publicId, vault, fullName, relationship, dateOfBirth, phone, email,
				identityNumberEncrypted);
		beneficiary.origin = ORIGIN_COURT_DOCUMENT;
		beneficiary.originDossierVersionId = dossierVersionId;
		return beneficiary;
	}

	public Beneficiary(UUID publicId, Vault vault, String fullName, String relationship, LocalDate dateOfBirth,
			String phone, String email, byte[] identityNumberEncrypted) {
		this.publicId = publicId;
		this.vault = vault;
		this.fullName = fullName;
		this.relationship = relationship;
		this.dateOfBirth = dateOfBirth;
		this.phone = phone;
		this.email = email;
		this.identityNumberEncrypted = identityNumberEncrypted;
		this.identityDocumentType = identityNumberEncrypted == null ? null : "IDENTITY_NUMBER";
		this.status = "DESIGNATED";
	}

	@PrePersist
	void onCreate() {
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		if (publicId == null) publicId = UUID.randomUUID();
		if (createdAt == null) createdAt = now;
		if (updatedAt == null) updatedAt = now;
	}

	@PreUpdate
	void onUpdate() {
		updatedAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	public void update(String fullName, String relationship, LocalDate dateOfBirth,
			String phone, String email, byte[] identityNumberEncrypted) {
		this.fullName = fullName;
		this.relationship = relationship;
		this.dateOfBirth = dateOfBirth;
		this.phone = phone;
		this.email = email;
		if (identityNumberEncrypted != null) {
			this.identityNumberEncrypted = identityNumberEncrypted;
			this.identityDocumentType = "IDENTITY_NUMBER";
		}
	}

	public Long getId() { return id; }
	public UUID getPublicId() { return publicId; }
	public Vault getVault() { return vault; }
	public String getFullName() { return fullName; }
	public String getRelationship() { return relationship; }
	public LocalDate getDateOfBirth() { return dateOfBirth; }
	public String getPhone() { return phone; }
	public String getEmail() { return email; }
	public boolean hasIdentityNumber() { return identityNumberEncrypted != null && identityNumberEncrypted.length > 0; }
	public boolean hasAccount() { return linkedUserId != null; }
	public Long getLinkedUserId() { return linkedUserId; }
	public String getAccountStatus() { return accountStatus; }
	public String getOrigin() { return origin; }
	public Long getOriginDossierVersionId() { return originDossierVersionId; }
	/** ST-24: link the beneficiary record to an official account; the legal identity record is not altered. */
	public void linkAccount(Long userId) {
		if (userId == null || linkedUserId != null) throw new IllegalStateException("Beneficiary account cannot be linked");
		this.linkedUserId = userId;
		this.accountStatus = ACCOUNT_CREATED;
	}
	public String getIdentityVerificationStatus() { return identityVerificationStatus; }
	public void verifyAtCounter() { this.identityVerificationStatus = VERIFIED_AT_COUNTER; }
	/** A new NOT_MATCH invalidates any previous at-counter verification. History remains append-only. */
	public void markIdentityNotVerified() { this.identityVerificationStatus = NOT_VERIFIED; }
	public String getStatus() { return status; }
	public LocalDateTime getCreatedAt() { return createdAt; }
	public LocalDateTime getUpdatedAt() { return updatedAt; }
}
