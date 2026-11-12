package com.legacyvault.auth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import org.springframework.data.domain.Persistable;

import java.time.LocalDateTime;

/**
 * Dấu "dùng một lần" của một ID token Google đã xác minh, bảng {@code dbo.google_login_credential_uses}.
 * Chỉ lưu vân tay SHA-256 của token (khóa chính {@code credential_hash}) để chống phát lại (replay); dòng hết hạn
 * sẽ bị dọn bởi {@code GoogleLoginCredentialUseRepository.deleteByExpiresAtLessThanEqual}. Được ghi trong
 * {@link GoogleAuthService} khi đăng nhập/liên kết/đặt mật khẩu bằng Google. Dùng {@link Persistable} để Spring Data
 * luôn {@code INSERT} (khóa là giá trị gán sẵn), nhờ đó trùng khóa báo lỗi khi token bị tái sử dụng.
 */
@Entity
@Table(name = "google_login_credential_uses", schema = "dbo")
public class GoogleLoginCredentialUse implements Persistable<String> {
    /**
     * SHA-256 (hex, 64 ký tự) của ID token, là khóa chính.
     */
    @Id
    @Column(name = "credential_hash", nullable = false, length = 64)
    private String credentialHash;

    /**
     * Thời điểm (UTC) token hết hạn; sau mốc này dòng có thể bị xóa.
     */
    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    /**
     * Cờ nội bộ: {@code true} khi thực thể chưa được lưu (dùng cho {@link #isNew()}).
     */
    @Transient
    private boolean newEntity = true;

    /**
     * Constructor không tham số dành cho JPA.
     */
    protected GoogleLoginCredentialUse() {
    }

    /**
     * Tạo dấu dùng một lần.
     *
     * @param credentialHash vân tay SHA-256 của token
     * @param expiresAt      thời điểm hết hạn của token (UTC)
     */
    public GoogleLoginCredentialUse(String credentialHash, LocalDateTime expiresAt) {
        this.credentialHash = credentialHash;
        this.expiresAt = expiresAt;
    }

    /**
     * Trả về khóa chính (vân tay token).
     */
    @Override
    public String getId() {
        return credentialHash;
    }

    /**
     * Cho Spring Data biết thực thể mới hay không (quyết định persist hay merge).
     */
    @Override
    @Transient
    public boolean isNew() {
        return newEntity;
    }

    /**
     * Sau khi lưu xong, đánh dấu thực thể không còn là mới.
     */
    @PostPersist
    private void markPersisted() {
        newEntity = false;
    }

    /**
     * Sau khi nạp từ DB, đánh dấu thực thể không còn là mới.
     */
    @PostLoad
    private void markLoaded() {
        newEntity = false;
    }
}
