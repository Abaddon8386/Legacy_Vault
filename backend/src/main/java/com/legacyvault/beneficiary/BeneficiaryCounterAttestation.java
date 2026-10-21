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

import com.legacyvault.verification.entity.VerificationCase;

/** Append-only Staff attestation that original identity documents were checked at the counter. */
@Entity
@Table(name = "beneficiary_counter_attestations", schema = "dbo")
public class BeneficiaryCounterAttestation {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "attestation_id")
	private Long id;

	@Column(name = "public_id", nullable = false, updatable = false)
	private UUID publicId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "verification_case_id", nullable = false, updatable = false)
	private VerificationCase verificationCase;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "beneficiary_id", nullable = false, updatable = false)
	private Beneficiary beneficiary;

	@Column(name = "staff_user_id", nullable = false, updatable = false)
	private Long staffUserId;

	@Column(name = "evidence_reference", nullable = false, length = 200, updatable = false)
	private String evidenceReference;

	@Column(name = "attested_at", nullable = false, updatable = false)
	private LocalDateTime attestedAt;

	protected BeneficiaryCounterAttestation() { }

	public BeneficiaryCounterAttestation(VerificationCase verificationCase, Beneficiary beneficiary,
			Long staffUserId, String evidenceReference) {
		this.verificationCase = verificationCase;
		this.beneficiary = beneficiary;
		this.staffUserId = staffUserId;
		this.evidenceReference = evidenceReference;
	}

	@PrePersist
	void onCreate() {
		if (publicId == null) publicId = UUID.randomUUID();
		if (attestedAt == null) attestedAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	public Long getId() { return id; }
	public UUID getPublicId() { return publicId; }
	public VerificationCase getVerificationCase() { return verificationCase; }
	public Beneficiary getBeneficiary() { return beneficiary; }
	public Long getStaffUserId() { return staffUserId; }
	public String getEvidenceReference() { return evidenceReference; }
	public LocalDateTime getAttestedAt() { return attestedAt; }
}
