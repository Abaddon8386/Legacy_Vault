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

/**
 * Thực thể ánh xạ bảng {@code dbo.beneficiary_identity_verifications}: lịch sử mỗi lần Staff đối chiếu giấy tờ của người thụ hưởng
 * (chỉ thêm, không sửa). Chỉ lưu 4 ký tự cuối của số giấy tờ, không lưu số đầy đủ. Tạo bởi {@code IdentityVerificationService.verify}.
 */
@Entity
@Table(name = "beneficiary_identity_verifications", schema = "dbo")
public class IdentityVerificationRecord {

	/**
	 * Khóa chính nội bộ (cột {@code verification_id}).
	 */
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "verification_id")
	private Long id;

	/**
	 * Mã công khai, trả về là {@code id}.
	 */
	@Column(name = "public_id", nullable = false, updatable = false)
	private UUID publicId;

	/**
	 * Người thụ hưởng được xác minh.
	 */
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "beneficiary_id", nullable = false)
	private Beneficiary beneficiary;

	/**
	 * Id Staff thực hiện.
	 */
	@Column(name = "actor_user_id", nullable = false)
	private Long actorUserId;

	/**
	 * Loại giấy tờ ({@code CCCD} hoặc {@code PASSPORT}).
	 */
	@Column(name = "document_type", nullable = false, length = 20)
	private String documentType;

	@Column(name = "issuing_authority", length = 150)
	private String issuingAuthority;

	/**
	 * Bốn ký tự cuối của số giấy tờ.
	 */
	@Column(name = "document_suffix", length = 4)
	private String documentSuffix;

	/**
	 * Kết quả ({@code MATCH} hoặc {@code NOT_MATCH}).
	 */
	@Column(name = "result", nullable = false, length = 20)
	private String result;

	/**
	 * Thời điểm xác minh (UTC).
	 */
	@Column(name = "verified_at", nullable = false)
	private LocalDateTime verifiedAt;

	/**
	 * Hàm khởi tạo mặc định cho JPA.
	 */
	protected IdentityVerificationRecord() { }

	/**
	 * Tạo bản ghi xác minh mới.
	 */
	public IdentityVerificationRecord(Beneficiary beneficiary, Long actorUserId, String documentType,
			String issuingAuthority, String documentSuffix, String result) {
		this.beneficiary = beneficiary;
		this.actorUserId = actorUserId;
		this.documentType = documentType;
		this.issuingAuthority = issuingAuthority;
		this.documentSuffix = documentSuffix;
		this.result = result;
	}

	/**
	 * Callback JPA trước khi INSERT: sinh {@code publicId} và {@code verifiedAt} nếu còn trống.
	 */
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
