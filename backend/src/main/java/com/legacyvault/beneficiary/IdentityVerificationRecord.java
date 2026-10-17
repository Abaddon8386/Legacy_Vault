package com.legacyvault.beneficiary;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "beneficiary_identity_verifications", schema = "dbo")
public class IdentityVerificationRecord {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "verification_id")
	private Long id;

	@Column(name = "public_id", nullable = false, updatable = false)
	private UUID publicId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "beneficiary_id", nullable = false)
	private Beneficiary beneficiary;

	@Column(name = "actor_user_id", nullable = false)
	private Long actorUserId;

	@Column(name = "document_type", nullable = false, length = 20)
	private String documentType;

	@Column(name = "issuing_authority", length = 150)
	private String issuingAuthority;

	@Column(name = "document_suffix", length = 4)
	private String documentSuffix;

	@Column(name = "result", nullable = false, length = 20)
	private String result;

	@Column(name = "verified_at", nullable = false)
	private LocalDateTime verifiedAt;

	protected IdentityVerificationRecord() { }

	public IdentityVerificationRecord(Beneficiary beneficiary, Long actorUserId, String documentType,
			String issuingAuthority, String documentSuffix, String result) {
		this.beneficiary = beneficiary;
		this.actorUserId = actorUserId;
		this.documentType = documentType;
		this.issuingAuthority = issuingAuthority;
		this.documentSuffix = documentSuffix;
		this.result = result;
	}

	@PrePersist
	void onCreate() {
		if (publicId == null) publicId = UUID.randomUUID();
		if (verifiedAt == null) verifiedAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	public Long getId() { return id; }
	public UUID getPublicId() { return publicId; }
	public Beneficiary getBeneficiary() { return beneficiary; }
	public Long getActorUserId() { return actorUserId; }
	public String getDocumentType() { return documentType; }
	public String getIssuingAuthority() { return issuingAuthority; }
	public String getDocumentSuffix() { return documentSuffix; }
	public String getResult() { return result; }
	public LocalDateTime getVerifiedAt() { return verifiedAt; }
}
