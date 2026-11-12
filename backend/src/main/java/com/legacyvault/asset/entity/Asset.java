package com.legacyvault.asset.entity;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import com.legacyvault.common.crypto.EncryptedData;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * Entity ánh xạ bảng {@code dbo.assets} (PS-73). {@code title} ↔ {@code name} của API. Payload chỉ lưu dạng mã hóa;
 * ba cột mã hóa luôn cùng có hoặc cùng null (CK_assets_encryption_fields).
 *
 * <p>{@code publicId} được sinh ngay khi tạo đối tượng (không đợi persist) vì nó là associatedData của ciphertext.
 * Tạo Asset không phải bàn giao: entity không có trường hay trạng thái handover.
 *
 * <p>Được tạo / sửa bởi {@code AssetService}, truy vấn qua {@code AssetRepository}; Will (loại DOCUMENT) cũng dùng chung bảng
 * này qua {@code WillService}.
 */
@Entity
@Table(name = "assets", schema = "dbo")
public class Asset {

	/**
	 * Khóa chính nội bộ ({@code asset_id}, IDENTITY); không lộ ra API.
	 */
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "asset_id")
	private Long assetId;

	/**
	 * Id công khai của Asset; bất biến sau khi tạo và là associatedData khi mã hóa payload.
	 */
	@Column(name = "public_id", nullable = false, unique = true, updatable = false)
	private UUID publicId;

	/**
	 * Khóa ngoại tới {@code vaults.vault_id} (id nội bộ của Vault chứa Asset); bất biến.
	 */
	@Column(name = "vault_id", nullable = false, updatable = false)
	private Long vaultId;

	/**
	 * Loại Asset ({@link AssetType}), lưu dạng chuỗi; bất biến sau khi tạo.
	 */
	@Enumerated(EnumType.STRING)
	@Column(name = "asset_type", nullable = false, length = 40, updatable = false)
	private AssetType assetType;

	/**
	 * Tên Asset, cột {@code title}.
	 */
	@Column(name = "title", nullable = false, length = 200)
	private String name;

	/**
	 * Mô tả tùy chọn (null nếu không có).
	 */
	@Column(name = "description")
	private String description;

	/**
	 * Ciphertext AES-GCM của payload; null nếu chưa có nội dung.
	 */
	@Column(name = "encrypted_payload")
	private byte[] encryptedPayload;

	/**
	 * Số byte nội dung payload hiện tại, do SQL Server tự tính từ độ dài ciphertext AES-GCM (không gồm tag 16 byte);
	 * chỉ đọc. {@code AssetService.updateAsset} dùng để tính chênh lệch quota.
	 */
	@Column(name = "payload_size_bytes", insertable = false, updatable = false)
	private long payloadSizeBytes;

	/**
	 * @return số byte payload hiện lưu (cột tính toán, chỉ đọc)
	 */
	public long getPayloadSizeBytes() { return payloadSizeBytes; }

	/**
	 * Vector khởi tạo (IV) dùng khi mã hóa payload.
	 */
	@Column(name = "encryption_iv")
	private byte[] encryptionIv;

	/**
	 * Phiên bản khóa mã hóa đã dùng, để xoay khóa về sau.
	 */
	@Column(name = "encryption_key_version", length = 50)
	private String encryptionKeyVersion;

	/**
	 * Trạng thái Asset (mặc định {@code ACTIVE} khi persist).
	 */
	@Column(name = "status", nullable = false, length = 20)
	private String status;

	/**
	 * Thời điểm tạo (UTC), đặt trong {@link #onCreate()}.
	 */
	@Column(name = "created_at", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	/**
	 * Thời điểm sửa gần nhất (UTC), cập nhật trong {@link #onUpdate()}.
	 */
	@Column(name = "updated_at", nullable = false)
	private LocalDateTime updatedAt;

	/**
	 * Constructor không tham số cho JPA.
	 */
	protected Asset() {
	}

	/**
	 * Tạo Asset mới chưa có payload; sinh ngay {@code publicId} ngẫu nhiên.
	 *
	 * @param vaultId id nội bộ của Vault
	 * @param assetType loại Asset
	 * @param name tên Asset
	 * @param description mô tả (có thể null)
	 */
	public Asset(Long vaultId, AssetType assetType, String name, String description) {
		this.publicId = UUID.randomUUID();
		this.vaultId = vaultId;
		this.assetType = assetType;
		this.name = name;
		this.description = description;
	}

	/**
	 * Callback JPA trước khi insert: đặt status {@code ACTIVE} nếu chưa có, và {@code createdAt}/{@code updatedAt} = hiện tại (UTC).
	 */
	@PrePersist
	protected void onCreate() {
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		if (status == null) {
			status = "ACTIVE";
		}
		createdAt = now;
		updatedAt = now;
	}

	/**
	 * Callback JPA trước khi update: cập nhật {@code updatedAt} theo giờ UTC.
	 */
	@PreUpdate
	protected void onUpdate() {
		updatedAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	/**
	 * Đổi tên Asset.
	 *
	 * @param name tên mới (đã trim)
	 */
	public void rename(String name) {
		this.name = name;
	}

	/**
	 * Đổi mô tả Asset.
	 *
	 * @param description mô tả mới (null = xóa)
	 */
	public void changeDescription(String description) {
		this.description = description;
	}

	/**
	 * Ghi payload đã mã hóa: lưu đồng thời ciphertext, IV và phiên bản khóa từ {@link EncryptedData}.
	 *
	 * @param data kết quả mã hóa từ {@code EncryptionService}
	 */
	public void setEncryptedPayload(EncryptedData data) {
		this.encryptedPayload = data.ciphertext();
		this.encryptionIv = data.iv();
		this.encryptionKeyVersion = data.keyVersion();
	}

	/**
	 * @return true nếu Asset đã có payload mã hóa
	 */
	public boolean hasPayload() {
		return encryptedPayload != null;
	}

	/** Dữ liệu đã mã hóa để giải mã (chỉ cho luồng Owner xác nhận lại mật khẩu); null nếu chưa có payload. */
	public EncryptedData encryptedPayload() {
		return encryptedPayload == null ? null : new EncryptedData(encryptedPayload, encryptionIv, encryptionKeyVersion);
	}

	/**
	 * @return id nội bộ của Asset
	 */
	public Long getAssetId() {
		return assetId;
	}

	/**
	 * @return id công khai (UUID) của Asset
	 */
	public UUID getPublicId() {
		return publicId;
	}

	/**
	 * @return id nội bộ của Vault chứa Asset
	 */
	public Long getVaultId() {
		return vaultId;
	}

	/**
	 * @return loại Asset
	 */
	public AssetType getAssetType() {
		return assetType;
	}

	/**
	 * @return tên Asset
	 */
	public String getName() {
		return name;
	}

	/**
	 * @return mô tả (có thể null)
	 */
	public String getDescription() {
		return description;
	}

	/**
	 * @return trạng thái Asset
	 */
	public String getStatus() {
		return status;
	}

	/**
	 * @return thời điểm tạo (UTC)
	 */
	public LocalDateTime getCreatedAt() {
		return createdAt;
	}

	/**
	 * @return thời điểm sửa gần nhất (UTC)
	 */
	public LocalDateTime getUpdatedAt() {
		return updatedAt;
	}
}
