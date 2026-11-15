
package com.legacyvault.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Tài khoản người dùng, ánh xạ bảng {@code dbo.users}. {@code userId} là khóa nội bộ, {@code publicId} (UUID) là định danh công khai dùng trong API và JWT.
 *
 * <p>Điểm cần lưu ý: {@code authVersion} tăng lên để vô hiệu mọi token đã cấp; {@code status} (PENDING, ACTIVE, LOCKED...);
 * {@code deletedAt} khác null nghĩa là đã xóa mềm; mọi thời điểm lưu theo UTC.
 */
@Entity
@Table(name = "users", schema = "dbo")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id")
    private Long userId;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "full_name", nullable = false, length = 150)
    private String fullName;

    @Column(name = "email", nullable = false, unique = true, length = 254)
    private String email;

    @Column(name = "phone_number", length = 20)
    private String phoneNumber;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    // Phiên bản xác thực: JwtAuthenticationFilter so khớp với claim authVersion trong token.
    @Column(name = "auth_version", nullable = false)
    private long authVersion;
    // Cho phép đăng nhập bằng mật khẩu hay không (false với tài khoản chỉ dùng Google); null là tài khoản cũ chưa phân loại.
    @Column(name = "password_login_enabled")
    private Boolean passwordLoginEnabled = true;
    @Column(name = "password_reset_at")
    // UTC DATETIME2 phải dùng trực tiếp JDBC 4.2, không dùng java.sql.Timestamp / quy tắc DST của máy chủ.
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.LOCAL_DATE_TIME)
    private LocalDateTime passwordResetAt;

    public long getAuthVersion() { return authVersion; }
    public boolean isPasswordLoginEnabled() { return Boolean.TRUE.equals(passwordLoginEnabled); }
    // NULL là tài khoản cũ chưa phân loại: giữ nguyên đăng nhập hiện có nhưng không cho phép khôi phục mật khẩu.
    public boolean isPasswordLoginAllowed() { return !Boolean.FALSE.equals(passwordLoginEnabled); }
    public void setPasswordLoginEnabled(boolean enabled) { passwordLoginEnabled=enabled; }
    public LocalDateTime getPasswordResetAt() { return passwordResetAt; }
    /** Vô hiệu mọi access token đã cấp mà không động đến dữ liệu khôi phục mật khẩu. */
    public void revokeSessions() { authVersion = Math.addExact(authVersion, 1); }
    /**
     * Tăng authVersion (vô hiệu mọi token cũ) và ghi nhận thời điểm đặt lại mật khẩu.
     *
     * @param at thời điểm (UTC) đặt lại mật khẩu
     */
    public void advanceAuthVersion(LocalDateTime at) {
        authVersion = Math.addExact(authVersion, 1); passwordResetAt=at;
    }


    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "email_verified_at")
    private LocalDateTime emailVerifiedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    public User() {
    }

    // Giá trị mặc định khi tạo: publicId ngẫu nhiên, status PENDING, createdAt/updatedAt theo UTC.
    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now(java.time.ZoneOffset.UTC);

        if (publicId == null) {
            publicId = UUID.randomUUID();
        }

        if (status == null) {
            status = "PENDING";
        }

        if (createdAt == null) {
            createdAt = now;
        }

        if (updatedAt == null) {
            updatedAt = now;
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now(java.time.ZoneOffset.UTC);
    }

    public Long getUserId() {
        return userId;
    }

    public UUID getPublicId() {
        return publicId;
    }

    public void setPublicId(UUID publicId) {
        this.publicId = publicId;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPhoneNumber() {
        return phoneNumber;
    }

    public void setPhoneNumber(String phoneNumber) {
        this.phoneNumber = phoneNumber;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public LocalDateTime getEmailVerifiedAt() {
        return emailVerifiedAt;
    }

    public void setEmailVerifiedAt(LocalDateTime emailVerifiedAt) {
        this.emailVerifiedAt = emailVerifiedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public LocalDateTime getDeletedAt() {
        return deletedAt;
    }

    public void setDeletedAt(LocalDateTime deletedAt) {
        this.deletedAt = deletedAt;
    }
}
