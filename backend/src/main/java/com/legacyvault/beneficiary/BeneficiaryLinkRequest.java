package com.legacyvault.beneficiary;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * BE-01: a signed-in account asks to be linked to a recipient of a verification case. The row only records the
 * request; {@code beneficiaryId} is set when Staff approves it and it is the single source of truth for the link target.
 */
@Entity
@Table(name = "beneficiary_link_requests", schema = "dbo")
public class BeneficiaryLinkRequest {

	public static final String PENDING = "PENDING";
	public static final String APPROVED = "APPROVED";
	public static final String REJECTED = "REJECTED";
	public static final String CANCELLED = "CANCELLED";
	/** Persisted when an expired PENDING row is touched; also reported for a PENDING row past expires_at. */
	public static final String EXPIRED = "EXPIRED";

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "link_request_id")
	private Long id;

	@Column(name = "public_id", nullable = false, updatable = false)
	private UUID publicId;

	@Column(name = "requester_user_id", nullable = false, updatable = false)
	private Long requesterUserId;

	@Column(name = "verification_case_id", nullable = false, updatable = false)
	private Long verificationCaseId;

	@Column(name = "status", nullable = false, length = 20)
	private String status;

	@Column(name = "beneficiary_id")
	private Long beneficiaryId;

	@Column(name = "decided_by_user_id")
	private Long decidedByUserId;

	@Column(name = "decided_at")
	private LocalDateTime decidedAt;

	@Column(name = "expires_at", nullable = false, updatable = false)
	private LocalDateTime expiresAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private LocalDateTime updatedAt;

	protected BeneficiaryLinkRequest() { }

	public BeneficiaryLinkRequest(Long requesterUserId, Long verificationCaseId, LocalDateTime expiresAt) {
		this.publicId = UUID.randomUUID();
		this.requesterUserId = requesterUserId;
		this.verificationCaseId = verificationCaseId;
		this.status = PENDING;
		this.expiresAt = expiresAt;
	}

	@PrePersist
	void onCreate() {
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		createdAt = now;
		updatedAt = now;
	}

	@PreUpdate
	void onUpdate() { updatedAt = LocalDateTime.now(ZoneOffset.UTC); }

	/** PENDING, or EXPIRED when the pending request ran past its deadline. */
	public String effectiveStatus(LocalDateTime now) {
		return PENDING.equals(status) && !expiresAt.isAfter(now) ? EXPIRED : status;
	}

	public boolean isOpen(LocalDateTime now) { return PENDING.equals(effectiveStatus(now)); }

	public void approve(Long beneficiaryId, Long staffUserId, LocalDateTime now) {
		this.status = APPROVED;
		this.beneficiaryId = beneficiaryId;
		this.decidedByUserId = staffUserId;
		this.decidedAt = now;
	}

	public void reject(Long staffUserId, LocalDateTime now) {
		this.status = REJECTED;
		this.decidedByUserId = staffUserId;
		this.decidedAt = now;
	}

	public void expire(LocalDateTime now) {
		this.status = EXPIRED;
		this.decidedAt = now;
	}

	public void cancel(LocalDateTime now) {
		this.status = CANCELLED;
		this.decidedAt = now;
	}

	public Long getId() { return id; }
	public UUID getPublicId() { return publicId; }
	public Long getRequesterUserId() { return requesterUserId; }
	public Long getVerificationCaseId() { return verificationCaseId; }
	public String getStatus() { return status; }
	public Long getBeneficiaryId() { return beneficiaryId; }
	public LocalDateTime getExpiresAt() { return expiresAt; }
	public LocalDateTime getCreatedAt() { return createdAt; }
}
