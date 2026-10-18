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
 * Bảng {@code dbo.assets} (PS-73). {@code title} ↔ {@code name} của API. Payload chỉ lưu dạng mã hóa;
 * ba cột mã hóa luôn cùng có hoặc cùng null (CK_assets_encryption_fields).
 *
 * <p>{@code publicId} được sinh ngay khi tạo đối tượng (không đợi persist) vì nó là associatedData của ciphertext.
 * Tạo Asset không phải bàn giao: entity không có trường hay trạng thái handover.
 */
@Entity
@Table(name = "assets", schema = "dbo")
public class Asset {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "asset_id")
	private Long assetId;

	@Column(name = "public_id", nullable = false, unique = true, updatable = false)
	private UUID publicId;

	@Column(name = "vault_id", nullable = false, updatable = false)
	private Long vaultId;

	@Enumerated(EnumType.STRING)
	@Column(name = "asset_type", nullable = false, length = 40, updatable = false)
	private AssetType assetType;

	@Column(name = "title", nullable = false, length = 200)
	private String name;

	@Column(name = "description")
	private String description;

	@Column(name = "encrypted_payload")
	private byte[] encryptedPayload;

	/** Computed by SQL Server from the current AES-GCM content length; excludes the 16-byte tag. */
	@Column(name = "payload_size_bytes", insertable = false, updatable = false)
	private long payloadSizeBytes;

	public long getPayloadSizeBytes() { return payloadSizeBytes; }

	@Column(name = "encryption_iv")
	private byte[] encryptionIv;

	@Column(name = "encryption_key_version", length = 50)
	private String encryptionKeyVersion;

	@Column(name = "status", nullable = false, length = 20)
	private String status;

	@Column(name = "created_at", nullable = false, updatable = false)
	private LocalDateTime createdAt;

	@Column(name = "updated_at", nullable = false)
	private LocalDateTime updatedAt;

	protected Asset() {
	}

	public Asset(Long vaultId, AssetType assetType, String name, String description) {
		this.publicId = UUID.randomUUID();
		this.vaultId = vaultId;
		this.assetType = assetType;
		this.name = name;
		this.description = description;
	}

	@PrePersist
	protected void onCreate() {
		LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
		if (status == null) {
			status = "ACTIVE";
		}
		createdAt = now;
		updatedAt = now;
	}

	@PreUpdate
	protected void onUpdate() {
		updatedAt = LocalDateTime.now(ZoneOffset.UTC);
	}

	public void rename(String name) {
		this.name = name;
	}

	public void changeDescription(String description) {
		this.description = description;
	}

	public void setEncryptedPayload(EncryptedData data) {
		this.encryptedPayload = data.ciphertext();
		this.encryptionIv = data.iv();
		this.encryptionKeyVersion = data.keyVersion();
	}

	public boolean hasPayload() {
		return encryptedPayload != null;
	}

	/** Dữ liệu đã mã hóa để giải mã (chỉ cho luồng Owner xác nhận lại mật khẩu); null nếu chưa có payload. */
	public EncryptedData encryptedPayload() {
		return encryptedPayload == null ? null : new EncryptedData(encryptedPayload, encryptionIv, encryptionKeyVersion);
	}

	public Long getAssetId() {
		return assetId;
	}

	public UUID getPublicId() {
		return publicId;
	}

	public Long getVaultId() {
		return vaultId;
	}

	public AssetType getAssetType() {
		return assetType;
	}

	public String getName() {
		return name;
	}

	public String getDescription() {
		return description;
	}

	public String getStatus() {
		return status;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}

	public LocalDateTime getUpdatedAt() {
		return updatedAt;
	}
}
