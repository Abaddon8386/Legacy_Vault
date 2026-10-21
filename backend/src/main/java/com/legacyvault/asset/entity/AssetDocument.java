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

/** PS-114: encrypted PDF / Word document attached to an Asset. {@code toString} never exposes content. */
@Entity
@Table(name = "asset_documents", schema = "dbo")
public class AssetDocument {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "document_id")
	private Long id;
	@Column(name = "public_id", nullable = false)
	private UUID publicId = UUID.randomUUID();
	@Column(name = "asset_id", nullable = false)
	private Long assetId;
	@Column(name = "file_name", nullable = false)
	private String fileName;
	@Column(name = "content_type", nullable = false)
	private String contentType;
	@Column(name = "file_size_bytes", nullable = false)
	private long size;
	@Column(name = "sha256_hash", nullable = false, length = 64)
	private String sha256;
	@Column(name = "encrypted_content", nullable = false, columnDefinition = "varbinary(max)")
	private byte[] content;
	@Column(name = "encryption_iv", nullable = false, columnDefinition = "binary(12)")
	private byte[] iv;
	@Column(name = "key_version", nullable = false)
	private String keyVersion;
	@Column(name = "created_at", nullable = false)
	private Instant createdAt = Instant.now();

	protected AssetDocument() { }

	public AssetDocument(Long assetId, String fileName, String contentType, long size, String sha256) {
		this.assetId = assetId;
		this.fileName = fileName;
		this.contentType = contentType;
		this.size = size;
		this.sha256 = sha256;
	}

	public void encrypt(EncryptedData data) {
		content = data.ciphertext();
		iv = data.iv();
		keyVersion = data.keyVersion();
	}

	public EncryptedData encrypted() { return new EncryptedData(content, iv, keyVersion); }

	public Long getId() { return id; }
	public UUID getPublicId() { return publicId; }
	public Long getAssetId() { return assetId; }
	public String getFileName() { return fileName; }
	public String getContentType() { return contentType; }
	public long getSize() { return size; }
	public String getSha256() { return sha256; }
	public Instant getCreatedAt() { return createdAt; }

	@Override
	public String toString() { return "AssetDocument[id=" + publicId + ", sizeBytes=" + size + "]"; }
}
