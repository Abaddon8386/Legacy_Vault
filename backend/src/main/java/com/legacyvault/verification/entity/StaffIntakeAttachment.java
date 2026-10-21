package com.legacyvault.verification.entity;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import com.legacyvault.common.crypto.EncryptedData;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * PS-103 (ST-11, ST-13): append-only encrypted file or image attached to a received death document or to the original
 * paper will. Content is AES-256-GCM encrypted with the attachment's public id as associated data; a row copied onto
 * another attachment fails to decrypt. {@code toString} never exposes content.
 */
@Entity
@Table(name = "staff_intake_attachments", schema = "dbo")
public class StaffIntakeAttachment {

	public static final String SUBJECT_DEATH_DOCUMENT = "DEATH_DOCUMENT";
	public static final String SUBJECT_ORIGINAL_WILL = "ORIGINAL_WILL";

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "attachment_id")
	private Long attachmentId;

	@Column(name = "public_id", nullable = false, unique = true, updatable = false)
	private UUID publicId;

	@Column(name = "verification_case_id", nullable = false, updatable = false)
	private Long verificationCaseId;

	@Column(name = "death_document_record_id", updatable = false)
	private Long deathDocumentRecordId;

	@Column(name = "original_will_intake_id", updatable = false)
	private Long originalWillIntakeId;

	@Column(name = "original_file_name", nullable = false, length = 255, updatable = false)
	private String originalFileName;

	@Column(name = "content_type", nullable = false, length = 150, updatable = false)
	private String contentType;

	@Column(name = "file_size_bytes", nullable = false, updatable = false)
	private long fileSizeBytes;

	@Column(name = "sha256_hash", nullable = false, length = 64, updatable = false)
	private String sha256Hash;

	@Column(name = "encrypted_file_content", nullable = false, updatable = false)
	private byte[] encryptedFileContent;

	@Column(name = "encryption_iv", nullable = false, updatable = false)
	private byte[] encryptionIv;

	@Column(name = "encryption_key_version", nullable = false, length = 50, updatable = false)
	private String encryptionKeyVersion;

	@Column(name = "uploaded_by_user_id", nullable = false, updatable = false)
	private Long uploadedByUserId;

	@Column(name = "uploaded_at", nullable = false, updatable = false)
	private LocalDateTime uploadedAt;

	protected StaffIntakeAttachment() { }

	private StaffIntakeAttachment(Long verificationCaseId, String originalFileName, String contentType,
			long fileSizeBytes, String sha256Hash, Long uploadedByUserId) {
		this.publicId = UUID.randomUUID();
		this.verificationCaseId = verificationCaseId;
		this.originalFileName = originalFileName;
		this.contentType = contentType;
		this.fileSizeBytes = fileSizeBytes;
		this.sha256Hash = sha256Hash;
		this.uploadedByUserId = uploadedByUserId;
	}

	public static StaffIntakeAttachment forDeathDocument(Long verificationCaseId, Long recordId, String fileName,
			String contentType, long size, String sha256, Long uploadedByUserId) {
		StaffIntakeAttachment a = new StaffIntakeAttachment(verificationCaseId, fileName, contentType, size, sha256,
				uploadedByUserId);
		a.deathDocumentRecordId = recordId;
		return a;
	}

	public static StaffIntakeAttachment forOriginalWill(Long verificationCaseId, Long intakeId, String fileName,
			String contentType, long size, String sha256, Long uploadedByUserId) {
		StaffIntakeAttachment a = new StaffIntakeAttachment(verificationCaseId, fileName, contentType, size, sha256,
				uploadedByUserId);
		a.originalWillIntakeId = intakeId;
		return a;
	}

	public void setEncryptedContent(EncryptedData data) {
		this.encryptedFileContent = data.ciphertext();
		this.encryptionIv = data.iv();
		this.encryptionKeyVersion = data.keyVersion();
	}

	public EncryptedData encryptedContent() {
		return new EncryptedData(encryptedFileContent, encryptionIv, encryptionKeyVersion);
	}

	/** Gắn ciphertext với đúng attachment: sao chép sang bản ghi khác thì giải mã thất bại. */
	public static byte[] associatedData(UUID attachmentPublicId) {
		return ("STAFF_INTAKE_ATTACHMENT:" + attachmentPublicId).getBytes(StandardCharsets.UTF_8);
	}

	@PrePersist
	protected void onCreate() {
		if (publicId == null) publicId = UUID.randomUUID();
		if (uploadedAt == null) uploadedAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	public Long getAttachmentId() { return attachmentId; }
	public UUID getPublicId() { return publicId; }
	public Long getVerificationCaseId() { return verificationCaseId; }
	public Long getDeathDocumentRecordId() { return deathDocumentRecordId; }
	public Long getOriginalWillIntakeId() { return originalWillIntakeId; }
	public String getOriginalFileName() { return originalFileName; }
	public String getContentType() { return contentType; }
	public long getFileSizeBytes() { return fileSizeBytes; }
	public String getSha256Hash() { return sha256Hash; }
	public Long getUploadedByUserId() { return uploadedByUserId; }
	public LocalDateTime getUploadedAt() { return uploadedAt; }

	@Override
	public String toString() {
		return "StaffIntakeAttachment[id=" + publicId + ", sizeBytes=" + fileSizeBytes + "]";
	}
}
