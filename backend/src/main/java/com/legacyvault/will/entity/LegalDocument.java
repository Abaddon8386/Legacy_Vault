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
 * Legal Verifier (ST-15) — API của Owner không bao giờ đặt {@code LEGAL_APPROVED} (LV-WILL-001).
 */
@Entity
@Table(name = "legal_documents", schema = "dbo")
public class LegalDocument {

	public static final String TYPE_WILL = "WILL";
	static final String STATUS_PENDING_VERIFICATION = "PENDING_VERIFICATION";

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "legal_document_id")
	private Long legalDocumentId;

	@Column(name = "public_id", nullable = false, unique = true, updatable = false)
	private UUID publicId;

	@Column(name = "asset_id", nullable = false, unique = true, updatable = false)
	private Long assetId;

	@Column(name = "document_type", nullable = false, length = 40, updatable = false)
	private String documentType;

	@Column(name = "verification_status", nullable = false, length = 30)
	private String verificationStatus;

	@Column(name = "created_at", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private LocalDateTime updatedAt;

	protected LegalDocument() {
	}

	public static LegalDocument will(Long assetId) {
		LegalDocument document = new LegalDocument();
		document.publicId = UUID.randomUUID();
		document.assetId = assetId;
		document.documentType = TYPE_WILL;
		document.verificationStatus = STATUS_PENDING_VERIFICATION;
		return document;
	}

	@PrePersist
	protected void onCreate() {
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		createdAt = now;
		updatedAt = now;
	}

	public Long getAssetId() {
		return assetId;
	}

	public String getDocumentType() {
		return documentType;
	}

	public String getVerificationStatus() {
		return verificationStatus;
	}
}
