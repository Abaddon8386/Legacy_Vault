package com.legacyvault.will.entity;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * Bảng {@code dbo.legal_documents} (PS-73): metadata nghiệp vụ gắn 1-1 với Asset loại DOCUMENT.
 *
 * <p>Owner chỉ tạo bản ghi với {@code document_type = 'WILL'} và trạng thái khởi đầu {@code PENDING_VERIFICATION}
 * (đúng mặc định của DB). Lớp này cố ý <b>không có</b> setter cho {@code verificationStatus}: việc thẩm định thuộc
 * Legal Verifier (ST-15) — API của Owner không bao giờ đặt {@code LEGAL_APPROVED} (LV-WILL-001). Tạo bởi {@code WillService.uploadWill}.
 */
@Entity
@Table(name = "legal_documents", schema = "dbo")
public class LegalDocument {

	/**
	 * Giá trị {@code document_type} cho di chúc.
	 */
	public static final String TYPE_WILL = "WILL";
	/**
	 * Trạng thái thẩm định khởi đầu.
	 */
	static final String STATUS_PENDING_VERIFICATION = "PENDING_VERIFICATION";

	/**
	 * Khóa chính nội bộ ({@code legal_document_id}).
	 */
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "legal_document_id")
	private Long legalDocumentId;

	/**
	 * Id công khai của hồ sơ pháp lý.
	 */
	@Column(name = "public_id", nullable = false, unique = true, updatable = false)
	private UUID publicId;

	/**
	 * Khóa ngoại 1-1 tới Asset DOCUMENT.
	 */
	@Column(name = "asset_id", nullable = false, unique = true, updatable = false)
	private Long assetId;

	/**
	 * Loại tài liệu pháp lý (hiện chỉ {@code WILL}); bất biến.
	 */
	@Column(name = "document_type", nullable = false, length = 40, updatable = false)
	private String documentType;

	/**
	 * Trạng thái thẩm định, chỉ Legal Verifier đổi (ST-15).
	 */
	@Column(name = "verification_status", nullable = false, length = 30)
	private String verificationStatus;

	/**
	 * Thời điểm tạo (UTC).
	 */
	@Column(name = "created_at", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	/**
	 * Thời điểm cập nhật gần nhất (UTC).
	 */
	@Column(name = "updated_at", nullable = false)
	private LocalDateTime updatedAt;

	/**
	 * Constructor không tham số cho JPA.
	 */
	protected LegalDocument() {
	}

	/**
	 * Factory tạo hồ sơ pháp lý loại WILL ở trạng thái {@code PENDING_VERIFICATION}.
	 *
	 * @param assetId id nội bộ Asset di chúc
	 * @return entity chưa persist
	 */
	public static LegalDocument will(Long assetId) {
		LegalDocument document = new LegalDocument();
		document.publicId = UUID.randomUUID();
		document.assetId = assetId;
		document.documentType = TYPE_WILL;
		document.verificationStatus = STATUS_PENDING_VERIFICATION;
		return document;
	}

	/**
	 * Callback JPA: đặt {@code createdAt}/{@code updatedAt} = hiện tại (UTC).
	 */
	@PrePersist
	protected void onCreate() {
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		createdAt = now;
		updatedAt = now;
	}

	/**
	 * @return id nội bộ Asset di chúc
	 */
	public Long getAssetId() {
		return assetId;
	}

	/**
	 * @return loại tài liệu (WILL)
	 */
	public String getDocumentType() {
		return documentType;
	}

	/**
	 * @return trạng thái thẩm định hiện tại
	 */
	public String getVerificationStatus() {
		return verificationStatus;
	}
}
