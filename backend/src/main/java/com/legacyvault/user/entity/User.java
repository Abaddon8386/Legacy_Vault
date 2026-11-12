
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
 * Tài khoản người dùng, bảng {@code dbo.users}. Là gốc của hầu hết nghiệp vụ: xác thực ({@code AuthService}), quản trị tài khoản
 * (admin), khóa ghi của Owner. Vai trò nằm ở {@link UserRole}. Xóa mềm bằng {@code deleted_at}. Trạng thái: {@code PENDING},
 * {@code ACTIVE}, {@code LOCKED}. Thời gian lưu UTC.
 */
@Entity
@Table(name = "users", schema = "dbo")
public class User {

    /**
     * Khóa chính nội bộ tự tăng, không lộ ra API.
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id")
    private Long userId;

    /**
     * Mã công khai (UUID) dùng trong API/JWT; sinh khi tạo (xem {@link #onCreate()}), không đổi.
     */
    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    /**
     * Họ tên đầy đủ.
     */
    @Column(name = "full_name", nullable = false, length = 150)
    private String fullName;

    /**
     * Email đã chuẩn hóa bằng {@code EmailNormalizer}; duy nhất ({@code UQ_users_email}).
     */
    @Column(name = "email", nullable = false, unique = true, length = 254)
    private String email;

    /**
     * Số điện thoại, có thể rỗng.
     */
    @Column(name = "phone_number", length = 20)
    private String phoneNumber;

    /**
     * Băm BCrypt của mật khẩu; với tài khoản Google-only là chuỗi ngẫu nhiên không ai biết.
     */
    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    /**
     * Phiên bản xác thực; JWT mang giá trị này và phải khớp mỗi request, tăng lên để vô hiệu mọi token cũ.
     */
    @Column(name = "auth_version", nullable = false)
    private long authVersion;
    /**
     * Cờ bật đăng nhập bằng mật khẩu; {@code false} với tài khoản Google-only chưa đặt mật khẩu, {@code null} với tài khoản cũ chưa phân loại.
     */
    @Column(name = "password_login_enabled")
    private Boolean passwordLoginEnabled = true;
    /**
     * Thời điểm đặt lại/đổi mật khẩu gần nhất (UTC); dùng để bỏ qua yêu cầu khôi phục cũ hơn mốc này.
     */
    @Column(name = "password_reset_at")
    // UTC DATETIME2 must use JDBC 4.2 directly, not java.sql.Timestamp / the host DST rules.
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.LOCAL_DATE_TIME)
    private LocalDateTime passwordResetAt;

    /**
     * Phiên bản xác thực hiện tại.
     */
    public long getAuthVersion() { return authVersion; }
    /**
     * {@code true} chỉ khi cờ được bật tường minh; dùng để quyết định tài khoản đủ điều kiện khôi phục mật khẩu/xác minh email.
     */
    public boolean isPasswordLoginEnabled() { return Boolean.TRUE.equals(passwordLoginEnabled); }
    /**
     * Cho phép đăng nhập bằng mật khẩu trừ khi bị tắt tường minh. {@code null} nghĩa là tài khoản cũ chưa phân loại: giữ nguyên
     * khả năng đăng nhập hiện có nhưng cấm khôi phục mật khẩu.
     */
    public boolean isPasswordLoginAllowed() { return !Boolean.FALSE.equals(passwordLoginEnabled); }
    /**
     * Bật/tắt đăng nhập bằng mật khẩu.
     */
    public void setPasswordLoginEnabled(boolean enabled) { passwordLoginEnabled=enabled; }
    /**
     * Thời điểm đặt lại mật khẩu gần nhất, hoặc {@code null}.
     */
    public LocalDateTime getPasswordResetAt() { return passwordResetAt; }
    /**
     * Tăng {@code authVersion} để vô hiệu mọi access token đã cấp mà không đụng tới dữ liệu khôi phục mật khẩu (dùng khi
     * admin khóa tài khoản/đổi role).
     *
     * @throws ArithmeticException nếu tràn số
     */
    public void revokeSessions() { authVersion = Math.addExact(authVersion, 1); }
    /**
     * Tăng {@code authVersion} và ghi mốc đặt lại mật khẩu; dùng khi đổi hoặc đặt lại mật khẩu.
     *
     * @param at thời điểm thay đổi (UTC)
     * @throws ArithmeticException nếu tràn số
     */
    public void advanceAuthVersion(LocalDateTime at) {
        authVersion = Math.addExact(authVersion, 1); passwordResetAt=at;
    }


    /**
     * Trạng thái tài khoản: {@code PENDING} (mặc định khi tạo), {@code ACTIVE}, {@code LOCKED}.
     */
    @Column(name = "status", nullable = false, length = 20)
    private String status;

    /**
     * Thời điểm email được xác minh (UTC), {@code null} nếu chưa.
     */
    @Column(name = "email_verified_at")
    private LocalDateTime emailVerifiedAt;

    /**
     * Thời điểm tạo (UTC).
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Thời điểm cập nhật gần nhất (UTC), tự đặt trong {@link #onUpdate()}.
     */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * Thời điểm xóa mềm; khác {@code null} nghĩa là tài khoản đã bị xóa.
     */
    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    /**
     * Constructor không tham số dành cho JPA.
     */
    public User() {
    }

    /**
     * Callback trước khi lưu: sinh {@code publicId}, đặt trạng thái mặc định {@code PENDING} và đặt {@code createdAt}/{@code updatedAt} nếu chưa có.
     */
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

    /**
     * Callback trước khi cập nhật: làm mới {@code updatedAt}.
     */
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now(java.time.ZoneOffset.UTC);
    }

    /**
     * Khóa chính nội bộ.
     */
    public Long getUserId() {
        return userId;
    }

    /**
     * Mã công khai (UUID).
     */
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
