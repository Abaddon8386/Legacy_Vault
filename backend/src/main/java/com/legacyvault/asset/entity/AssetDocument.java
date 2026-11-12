package com.legacyvault.asset.entity;

import java.time.Instant;
import java.util.UUID;

import com.legacyvault.common.crypto.EncryptedData;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Entity ánh xạ bảng {@code dbo.asset_documents} (PS-114): tài liệu PDF / Word được mã hóa và đính kèm vào một Asset.
 * Nội dung nằm ở {@code encrypted_content} (AES-256-GCM); {@code toString} không bao giờ lộ nội dung. Được
 * {@code AssetDocumentService} ghi/đọc qua {@code AssetDocumentRepository}.
 */
@Entity
@Table(name = "asset_documents", schema = "dbo")
public class AssetDocument {
	/**
	 * Khóa chính nội bộ ({@code document_id}, IDENTITY).
	 */
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "document_id")
	private Long id;
	/**
	 * Id công khai của tài liệu, sinh ngẫu nhiên khi tạo đối tượng (dùng trong AAD khi mã hóa).
	 */
	@Column(name = "public_id", nullable = false)
	private UUID publicId = UUID.randomUUID();
	/**
	 * Khóa ngoại tới {@code assets.asset_id}.
	 */
	@Column(name = "asset_id", nullable = false)
	private Long assetId;
	/**
	 * Tên file đã làm sạch (xem {@code WillFile.sanitizeFileName}).
	 */
	@Column(name = "file_name", nullable = false)
	private String fileName;
	/**
	 * MIME type phát hiện theo nội dung (PDF, DOC hoặc DOCX), không tin tên/khai báo của client.
	 */
	@Column(name = "content_type", nullable = false)
	private String contentType;
	/**
	 * Kích thước file gốc (byte), tính vào quota lưu trữ.
	 */
	@Column(name = "file_size_bytes", nullable = false)
	private long size;
	/**
	 * Mã băm SHA-256 (hex) của nội dung gốc.
	 */
	@Column(name = "sha256_hash", nullable = false, length = 64)
	private String sha256;
	/**
	 * Ciphertext của file (AES-256-GCM).
	 */
	@Column(name = "encrypted_content", nullable = false, columnDefinition = "varbinary(max)")
	private byte[] content;
	/**
	 * IV 12 byte dùng khi mã hóa.
	 */
	@Column(name = "encryption_iv", nullable = false, columnDefinition = "binary(12)")
	private byte[] iv;
	/**
	 * Phiên bản khóa mã hóa đã dùng.
	 */
	@Column(name = "key_version", nullable = false)
	private String keyVersion;
	/**
	 * Thời điểm tải lên.
	 */
	@Column(name = "created_at", nullable = false)
	private Instant createdAt = Instant.now();

	/**
	 * Constructor không tham số cho JPA.
	 */
	protected AssetDocument() { }

	/**
	 * Tạo bản ghi metadata tài liệu (chưa có nội dung mã hóa; gọi {@link #encrypt} sau).
	 *
	 * @param assetId id nội bộ của Asset
	 * @param fileName tên file đã làm sạch
	 * @param contentType MIME đã phát hiện
	 * @param size kích thước byte
	 * @param sha256 băm SHA-256 hex
	 */
	public AssetDocument(Long assetId, String fileName, String contentType, long size, String sha256) {
		this.assetId = assetId;
		this.fileName = fileName;
		this.contentType = contentType;
		this.size = size;
		this.sha256 = sha256;
	}

	/**
	 * Gắn kết quả mã hóa (ciphertext, IV, phiên bản khóa) vào bản ghi.
	 *
	 * @param data kết quả từ {@code EncryptionService}
	 */
	public void encrypt(EncryptedData data) {
		content = data.ciphertext();
		iv = data.iv();
		keyVersion = data.keyVersion();
	}

	/**
	 * @return gói ciphertext + IV + phiên bản khóa để giải mã
	 */
	public EncryptedData encrypted() { return new EncryptedData(content, iv, keyVersion); }

	/**
	 * @return id nội bộ
	 */
	public Long getId() { return id; }
	/**
	 * @return id công khai của tài liệu
	 */
	public UUID getPublicId() { return publicId; }
	/**
	 * @return id nội bộ của Asset chứa tài liệu
	 */
	public Long getAssetId() { return assetId; }
	/**
	 * @return tên file
	 */
	public String getFileName() { return fileName; }
	/**
	 * @return MIME type
	 */
	public String getContentType() { return contentType; }
	/**
	 * @return kích thước byte
	 */
	public long getSize() { return size; }
	/**
	 * @return băm SHA-256 hex
	 */
	public String getSha256() { return sha256; }
	/**
	 * @return thời điểm tải lên
	 */
	public Instant getCreatedAt() { return createdAt; }

	/**
	 * Chỉ in id công khai và kích thước, không in tên file hay nội dung.
	 */
	@Override
	public String toString() { return "AssetDocument[id=" + publicId + ", sizeBytes=" + size + "]"; }
}
