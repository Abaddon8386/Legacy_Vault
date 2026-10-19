package com.legacyvault.asset.entity;

import com.legacyvault.common.crypto.EncryptedData;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "asset_images", schema = "dbo")
public class AssetImage {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "image_id") private Long id;
    @Column(name = "public_id", nullable = false) private UUID publicId = UUID.randomUUID();
    @Column(name = "asset_id", nullable = false) private Long assetId;
    @Column(name = "slot_no", nullable = false) private int slot;
    @Column(name = "file_name", nullable = false) private String fileName;
    @Column(name = "content_type", nullable = false) private String contentType;
    @Column(name = "file_size_bytes", nullable = false) private long size;
    @Column(name = "encrypted_content", nullable = false, columnDefinition = "varbinary(max)") private byte[] content;
    @Column(name = "encryption_iv", nullable = false, columnDefinition = "varbinary(12)") private byte[] iv;
    @Column(name = "key_version", nullable = false) private String keyVersion;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();
    protected AssetImage() {}
    public AssetImage(Long assetId, int slot, String fileName, String contentType, long size) {
        this.assetId = assetId; this.slot = slot; this.fileName = fileName; this.contentType = contentType; this.size = size;
    }
    public void encrypt(EncryptedData data) { content = data.ciphertext(); iv = data.iv(); keyVersion = data.keyVersion(); }
    public EncryptedData encrypted() { return new EncryptedData(content, iv, keyVersion); }
    public UUID getPublicId() { return publicId; }
    public int getSlot() { return slot; }
    public String getFileName() { return fileName; }
    public String getContentType() { return contentType; }
    public long getSize() { return size; }
    public Instant getCreatedAt() { return createdAt; }
}
