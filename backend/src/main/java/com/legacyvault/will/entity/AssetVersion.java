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
 * (tới 10 MB) khi chỉ cần liệt kê. Được {@code WillService} ghi qua {@code AssetVersionRepository}.
 */
@Entity
@Table(name = "asset_versions", schema = "dbo")
public class AssetVersion {

	/**
	 * Trạng thái tải lên duy nhất mà Owner API đặt.
	 */
	public static final String STATUS_UPLOADED = "UPLOADED";

	/**
	 * Khóa chính nội bộ ({@code asset_version_id}).
	 */
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "asset_version_id")
	private Long assetVersionId;

	/**
	 * Id công khai của phiên bản; là associatedData khi mã hóa nội dung file.
	 */
	@Column(name = "public_id", nullable = false, unique = true, updatable = false)
	private UUID publicId;

	/**
	 * Khóa ngoại tới Asset di chúc ({@code assets.asset_id}).
	 */
	@Column(name = "asset_id", nullable = false, updatable = false)
	private Long assetId;

	/**
	 * Số phiên bản, tăng dần từ 1 trong phạm vi một di chúc.
	 */
	@Column(name = "version_no", nullable = false, updatable = false)
	private int versionNo;

	/**
	 * Tên file gốc đã làm sạch (chỉ để hiển thị).
	 */
	@Column(name = "original_file_name", nullable = false, length = 255, updatable = false)
	private String originalFileName;

	/**
	 * MIME phát hiện theo nội dung (PDF, JPEG, PNG).
	 */
	@Column(name = "content_type", nullable = false, length = 150, updatable = false)
	private String contentType;

	/**
	 * Kích thước file gốc (byte).
	 */
	@Column(name = "file_size_bytes", nullable = false, updatable = false)
	private long fileSizeBytes;

	/**
	 * SHA-256 hex của byte gốc, dùng để phát hiện dữ liệu bị sửa.
	 */
	@Column(name = "sha256_hash", nullable = false, length = 64, updatable = false)
	private String sha256Hash;

	/**
	 * Ciphertext AES-GCM của nội dung file.
	 */
	@Column(name = "encrypted_file_content", nullable = false, updatable = false)
	private byte[] encryptedFileContent;

	/**
	 * IV dùng khi mã hóa.
	 */
	@Column(name = "encryption_iv", nullable = false, updatable = false)
	private byte[] encryptionIv;

	/**
	 * Phiên bản khóa mã hóa đã dùng.
	 */
	@Column(name = "encryption_key_version", nullable = false, length = 50, updatable = false)
	private String encryptionKeyVersion;

	/**
	 * Chỉ là trạng thái tải lên; UPLOADED không đồng nghĩa LEGAL_APPROVED (LV-WILL-001).
	 */
	@Column(name = "upload_status", nullable = false, length = 20, updatable = false)
	private String uploadStatus;

	/**
	 * Id người dùng (Owner) đã tải lên.
	 */
	@Column(name = "uploaded_by_user_id", nullable = false, updatable = false)
	private Long uploadedByUserId;

	/**
	 * Thời điểm tải lên (UTC), đặt trong {@link #onCreate()}.
	 */
	@Column(name = "uploaded_at", nullable = false, updatable = false)
	private LocalDateTime uploadedAt;

	/**
	 * Constructor không tham số cho JPA.
	 */
	protected AssetVersion() {
	}

	/**
	 * Tạo phiên bản mới (chưa có nội dung mã hóa; gọi {@link #setEncryptedContent}). {@code publicId} sinh ngay vì nó là associatedData của nội dung file đã mã hóa; trạng thái đặt {@code UPLOADED}.
	 *
	 * @param assetId id nội bộ của Asset di chúc
	 * @param versionNo số phiên bản
	 * @param originalFileName tên file đã làm sạch
	 * @param contentType MIME
	 * @param fileSizeBytes kích thước
	 * @param sha256Hash băm SHA-256
	 * @param uploadedByUserId id Owner tải lên
	 */
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

	/**
	 * Callback JPA: đặt {@code uploadedAt} = hiện tại (UTC).
	 */
	@PrePersist
	protected void onCreate() {
		uploadedAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	/**
	 * Gắn ciphertext, IV, phiên bản khóa từ {@link EncryptedData}.
	 *
	 * @param data kết quả mã hóa
	 */
	public void setEncryptedContent(EncryptedData data) {
		this.encryptedFileContent = data.ciphertext();
		this.encryptionIv = data.iv();
		this.encryptionKeyVersion = data.keyVersion();
	}

	/**
	 * Dữ liệu đã mã hóa của file (chỉ cho luồng Owner xác nhận lại mật khẩu để mở file).
	 */
	public EncryptedData encryptedContent() {
		return new EncryptedData(encryptedFileContent, encryptionIv, encryptionKeyVersion);
	}

	/**
	 * @return khóa chính nội bộ
	 */
	public Long getAssetVersionId() {
		return assetVersionId;
	}

	/**
	 * @return id công khai
	 */
	public UUID getPublicId() {
		return publicId;
	}

	/**
	 * @return id nội bộ Asset di chúc
	 */
	public Long getAssetId() {
		return assetId;
	}

	/**
	 * @return số phiên bản
	 */
	public int getVersionNo() {
		return versionNo;
	}

	/**
	 * @return tên file gốc
	 */
	public String getOriginalFileName() {
		return originalFileName;
	}

	/**
	 * @return MIME
	 */
	public String getContentType() {
		return contentType;
	}

	/**
	 * @return kích thước byte
	 */
	public long getFileSizeBytes() {
		return fileSizeBytes;
	}

	/**
	 * @return băm SHA-256 hex
	 */
	public String getSha256Hash() {
		return sha256Hash;
	}

	/**
	 * @return trạng thái tải lên
	 */
	public String getUploadStatus() {
		return uploadStatus;
	}

	/**
	 * @return thời điểm tải lên (UTC)
	 */
	public LocalDateTime getUploadedAt() {
		return uploadedAt;
	}
}
