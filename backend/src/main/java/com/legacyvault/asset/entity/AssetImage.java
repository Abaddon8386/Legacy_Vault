package com.legacyvault.asset.entity;

import com.legacyvault.common.crypto.EncryptedData;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * Entity ánh xạ bảng {@code dbo.asset_images}: ảnh JPEG/PNG đính kèm Asset, nội dung mã hóa AES-GCM. Mỗi Asset
 * có tối đa 5 ảnh, mỗi ảnh chiếm một {@code slot_no}. Được {@code AssetImageService} quản lý qua
 * {@code AssetImageRepository}.
 *
 * <ul>
 * <li>{@code id} - khóa chính nội bộ ({@code image_id})</li>
 * <li>{@code publicId} - id công khai, dùng trong AAD khi mã hóa</li>
 * <li>{@code assetId} - khóa ngoại tới {@code assets}</li>
 * <li>{@code slot} - vị trí ảnh (1..5)</li>
 * <li>{@code fileName}, {@code contentType}, {@code size} - metadata ảnh</li>
 * <li>{@code content}, {@code iv}, {@code keyVersion} - ciphertext, IV và phiên bản khóa</li>
 * <li>{@code createdAt} - thời điểm tải lên</li>
 * </ul>
 */
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
    /**
     * Constructor không tham số cho JPA.
     */
    protected AssetImage() {}
    /**
     * Tạo bản ghi ảnh (chưa mã hóa nội dung).
     *
     * @param assetId id nội bộ của Asset
     * @param slot vị trí ảnh
     * @param fileName tên file
     * @param contentType MIME (image/jpeg hoặc image/png)
     * @param size kích thước byte
     */
    public AssetImage(Long assetId, int slot, String fileName, String contentType, long size) {
        this.assetId = assetId; this.slot = slot; this.fileName = fileName; this.contentType = contentType; this.size = size;
    }
    /**
     * Gắn ciphertext, IV, phiên bản khóa từ {@link EncryptedData}.
     */
    public void encrypt(EncryptedData data) { content = data.ciphertext(); iv = data.iv(); keyVersion = data.keyVersion(); }
    /**
     * @return gói dữ liệu mã hóa để giải mã
     */
    public EncryptedData encrypted() { return new EncryptedData(content, iv, keyVersion); }
    /**
     * @return id công khai của ảnh
     */
    public UUID getPublicId() { return publicId; }
    /**
     * @return số slot của ảnh
     */
    public int getSlot() { return slot; }
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
     * @return thời điểm tải lên
     */
    public Instant getCreatedAt() { return createdAt; }
}
