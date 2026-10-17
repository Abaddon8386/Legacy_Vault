package com.legacyvault.will.entity;

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
 * Bảng {@code dbo.asset_versions} (PS-73): một phiên bản file của di chúc số hóa (PS-17/PS-18).
 *
 * <p>Bất biến sau khi tạo: mọi cột {@code updatable = false}, không setter. File đổi = phiên bản mới, phiên bản cũ
 * giữ nguyên (LV-WILL-001, AC-L05). Đọc metadata qua projection ({@code WillVersionView}) để không nạp nội dung file
 * (tới 10 MB) khi chỉ cần liệt kê.
 */
@Entity
@Table(name = "asset_versions", schema = "dbo")
public class AssetVersion {

	public static final String STATUS_UPLOADED = "UPLOADED";

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "asset_version_id")
	private Long assetVersionId;

	@Column(name = "public_id", nullable = false, unique = true, updatable = false)
	private UUID publicId;

	@Column(name = "asset_id", nullable = false, updatable = false)
	private Long assetId;

	@Column(name = "version_no", nullable = false, updatable = false)
	private int versionNo;

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

	/** Chỉ là trạng thái tải lên; UPLOADED không đồng nghĩa LEGAL_APPROVED (LV-WILL-001). */
	@Column(name = "upload_status", nullable = false, length = 20, updatable = false)
	private String uploadStatus;

	@Column(name = "uploaded_by_user_id", nullable = false, updatable = false)
	private Long uploadedByUserId;

	@Column(name = "uploaded_at", nullable = false, updatable = false)
	private LocalDateTime uploadedAt;

	protected AssetVersion() {
	}

	/** {@code publicId} sinh ngay vì nó là associatedData của nội dung file đã mã hóa. */
	public AssetVersion(Long assetId, int versionNo, String originalFileName, String contentType, long fileSizeBytes,
			String sha256Hash, Long uploadedByUserId) {
		this.publicId = UUID.randomUUID();
		this.assetId = assetId;
		this.versionNo = versionNo;
		this.originalFileName = originalFileName;
		this.contentType = contentType;
		this.fileSizeBytes = fileSizeBytes;
		this.sha256Hash = sha256Hash;
		this.uploadedByUserId = uploadedByUserId;
		this.uploadStatus = STATUS_UPLOADED;
	}

	@PrePersist
	protected void onCreate() {
		uploadedAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	public void setEncryptedContent(EncryptedData data) {
		this.encryptedFileContent = data.ciphertext();
		this.encryptionIv = data.iv();
		this.encryptionKeyVersion = data.keyVersion();
	}

	/** Dữ liệu đã mã hóa của file (chỉ cho luồng Owner xác nhận lại mật khẩu để mở file). */
	public EncryptedData encryptedContent() {
		return new EncryptedData(encryptedFileContent, encryptionIv, encryptionKeyVersion);
	}

	public Long getAssetVersionId() {
		return assetVersionId;
	}

	public UUID getPublicId() {
		return publicId;
	}

	public Long getAssetId() {
		return assetId;
	}

	public int getVersionNo() {
		return versionNo;
	}

	public String getOriginalFileName() {
		return originalFileName;
	}

	public String getContentType() {
		return contentType;
	}

	public long getFileSizeBytes() {
		return fileSizeBytes;
	}

	public String getSha256Hash() {
		return sha256Hash;
	}

	public String getUploadStatus() {
		return uploadStatus;
	}

	public LocalDateTime getUploadedAt() {
		return uploadedAt;
	}
}
