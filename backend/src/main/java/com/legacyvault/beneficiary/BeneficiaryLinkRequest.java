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
 *
 * <p>Ánh xạ bảng {@code dbo.beneficiary_link_requests}. Vòng đời trạng thái: {@code PENDING} chuyển sang {@code APPROVED},
 * {@code REJECTED}, {@code CANCELLED} hoặc {@code EXPIRED}. Được tạo bởi {@code BeneficiaryLinkRequestService.submit}
 * và quyết định bởi {@code StaffLinkRequestService}.
 */
@Entity
@Table(name = "beneficiary_link_requests", schema = "dbo")
public class BeneficiaryLinkRequest {

	/**
	 * Trạng thái đang chờ Staff xử lý.
	 */
	public static final String PENDING = "PENDING";
	/**
	 * Trạng thái Staff đã duyệt và liên kết tài khoản.
	 */
	public static final String APPROVED = "APPROVED";
	/**
	 * Trạng thái Staff đã từ chối.
	 */
	public static final String REJECTED = "REJECTED";
	/**
	 * Trạng thái người yêu cầu tự hủy.
	 */
	public static final String CANCELLED = "CANCELLED";
	/** Persisted when an expired PENDING row is touched; also reported for a PENDING row past expires_at. */
	public static final String EXPIRED = "EXPIRED";

	/**
	 * Khóa chính nội bộ (cột {@code link_request_id}).
	 */
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "link_request_id")
	private Long id;

	/**
	 * Mã công khai của yêu cầu, trả về là {@code requestId}.
	 */
	@Column(name = "public_id", nullable = false, updatable = false)
	private UUID publicId;

	/**
	 * Id tài khoản gửi yêu cầu; đây là tài khoản sẽ được liên kết khi Staff duyệt.
	 */
	@Column(name = "requester_user_id", nullable = false, updatable = false)
	private Long requesterUserId;

	/**
	 * Id hồ sơ xác minh (case) mà yêu cầu nhắm tới.
	 */
	@Column(name = "verification_case_id", nullable = false, updatable = false)
	private Long verificationCaseId;

	/**
	 * Trạng thái lưu trong DB (xem hằng số); dùng {@link #effectiveStatus(LocalDateTime)} để biết trạng thái thực sự theo thời gian.
	 */
	@Column(name = "status", nullable = false, length = 20)
	private String status;

	/**
	 * Id người thụ hưởng được chọn khi duyệt; null cho tới khi {@code APPROVED}.
	 */
	@Column(name = "beneficiary_id")
	private Long beneficiaryId;

	/**
	 * Id Staff đã duyệt/từ chối.
	 */
	@Column(name = "decided_by_user_id")
	private Long decidedByUserId;

	@Column(name = "decided_at")
	private LocalDateTime decidedAt;

	/**
	 * Hạn của yêu cầu (UTC), cấu hình bởi {@code legacyvault.beneficiary.link-request-ttl-days}.
	 */
	@Column(name = "expires_at", nullable = false, updatable = false)
	private LocalDateTime expiresAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private LocalDateTime updatedAt;

	/**
	 * Hàm khởi tạo mặc định cho JPA.
	 */
	protected BeneficiaryLinkRequest() { }

	/**
	 * Tạo yêu cầu mới ở trạng thái {@code PENDING} với mã công khai ngẫu nhiên.
	 */
	public BeneficiaryLinkRequest(Long requesterUserId, Long verificationCaseId, LocalDateTime expiresAt) {
		this.publicId = UUID.randomUUID();
		this.requesterUserId = requesterUserId;
		this.verificationCaseId = verificationCaseId;
		this.status = PENDING;
		this.expiresAt = expiresAt;
	}

	/**
	 * Callback JPA trước khi INSERT: điền {@code createdAt} và {@code updatedAt} (UTC).
	 */
	@PrePersist
	void onCreate() {
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		createdAt = now;
		updatedAt = now;
	}

	/**
	 * Callback JPA trước khi UPDATE: cập nhật {@code updatedAt}.
	 */
	@PreUpdate
	void onUpdate() { updatedAt = LocalDateTime.now(ZoneOffset.UTC); }

	/** PENDING, or EXPIRED when the pending request ran past its deadline. */
	public String effectiveStatus(LocalDateTime now) {
		return PENDING.equals(status) && !expiresAt.isAfter(now) ? EXPIRED : status;
	}

	/**
	 * @return {@code true} nếu yêu cầu còn đang chờ và chưa quá hạn.
	 */
	public boolean isOpen(LocalDateTime now) { return PENDING.equals(effectiveStatus(now)); }

	/**
	 * Chuyển sang {@code APPROVED}, ghi người thụ hưởng, Staff quyết định và thời điểm.
	 */
	public void approve(Long beneficiaryId, Long staffUserId, LocalDateTime now) {
		this.status = APPROVED;
		this.beneficiaryId = beneficiaryId;
		this.decidedByUserId = staffUserId;
		this.decidedAt = now;
	}

	/**
	 * Chuyển sang {@code REJECTED}, ghi Staff quyết định và thời điểm.
	 */
	public void reject(Long staffUserId, LocalDateTime now) {
		this.status = REJECTED;
		this.decidedByUserId = staffUserId;
		this.decidedAt = now;
	}

	/**
	 * Chuyển sang {@code EXPIRED} (lưu khi một yêu cầu quá hạn bị chạm tới).
	 */
	public void expire(LocalDateTime now) {
		this.status = EXPIRED;
		this.decidedAt = now;
	}

	/**
	 * Chuyển sang {@code CANCELLED} do người yêu cầu hủy.
	 */
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
