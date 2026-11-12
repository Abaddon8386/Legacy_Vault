package com.legacyvault.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

/**
 * Ánh xạ tường minh nhà cung cấp/subject sang tài khoản, bảng {@code dbo.external_auth_identities} (hiện chỉ dùng cho
 * {@code GOOGLE}). Có ràng buộc duy nhất theo (provider, subject) {@code UQ_external_auth_identities_provider_subject}.
 * Việc cho phép liên kết tài khoản do {@code GoogleAuthService} kiểm soát; không bao giờ liên kết theo email.
 */
@Entity
@Table(name = "external_auth_identities", schema = "dbo")
public class ExternalAuthIdentity {
    /**
     * Khóa chính tự tăng.
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "external_auth_identity_id")
    private Long id;

    /**
     * Mã nhà cung cấp, ví dụ {@code GOOGLE}.
     */
    @Column(name = "provider_code", nullable = false, length = 30)
    private String providerCode;

    /**
     * Mã định danh ổn định của người dùng tại nhà cung cấp ({@code sub} của ID token).
     */
    @Column(name = "subject", nullable = false, length = 255)
    private String subject;

    /**
     * Tài khoản nội bộ được liên kết (nạp lười).
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /**
     * Thời điểm liên kết (UTC), không cập nhật lại.
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Constructor không tham số dành cho JPA.
     */
    protected ExternalAuthIdentity() {
    }

    /**
     * Tạo ánh xạ mới, đặt {@code createdAt} là giờ UTC hiện tại.
     *
     * @param providerCode mã nhà cung cấp
     * @param subject      subject tại nhà cung cấp
     * @param user         tài khoản được liên kết
     */
    public ExternalAuthIdentity(String providerCode, String subject, User user) {
        this.providerCode = providerCode;
        this.subject = subject;
        this.user = user;
        this.createdAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public Long getId() { return id; }
    public String getProviderCode() { return providerCode; }
    public String getSubject() { return subject; }
    public User getUser() { return user; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
