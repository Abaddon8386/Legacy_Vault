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
 * BE-01: tài khoản đã đăng nhập xin được liên kết với một người nhận của hồ sơ xác minh. Dòng này chỉ ghi
 * yêu cầu; {@code beneficiaryId} được đặt khi Staff duyệt và là nguồn sự thật duy nhất cho đích liên kết.
 */
@Entity
@Table(name = "beneficiary_link_requests", schema = "dbo")
public class BeneficiaryLinkRequest {

	public static final String PENDING = "PENDING";
	public static final String APPROVED = "APPROVED";
	public static final String REJECTED = "REJECTED";
	public static final String CANCELLED = "CANCELLED";
	/** Được lưu khi một dòng PENDING hết hạn bị chạm tới; cũng được báo cho dòng PENDING quá expires_at. */
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

	/** PENDING, hoặc EXPIRED khi yêu cầu đang chờ đã quá hạn. */
	public String effectiveStatus(LocalDateTime now) {
		return PENDING.equals(status) && !expiresAt.isAfter(now) ? EXPIRED : status;
	}

	/** Yêu cầu còn mở = vẫn PENDING và chưa quá hạn. */
	public boolean isOpen(LocalDateTime now) { return PENDING.equals(effectiveStatus(now)); }

	/** Staff duyệt: ghi người thụ hưởng đích ({@code beneficiaryId}) và người quyết định; đây là nguồn duy nhất xác định đích liên kết. */
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
