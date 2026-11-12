package com.legacyvault.subscription.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * Một version của gói đăng ký (bảng {@code dbo.subscription_plan_versions}), duy nhất theo (plan_code, version). Vòng đời:
 * DRAFT -> PUBLISHED -> DEPRECATED. Dùng khóa lạc quan {@code @Version} ({@code concurrency_token}). Quản lý bởi {@code AdminSubscriptionService}
 * qua {@code SubscriptionPlanVersionRepository}; khi publish, giá và giới hạn được đồng bộ sang {@code subscription_plans}.
 */
@Entity
@Table(
    name = "subscription_plan_versions",
    schema = "dbo",
    uniqueConstraints = {
        @UniqueConstraint(name = "UQ_sub_plan_code_version", columnNames = {"plan_code", "version"})
    }
)
public class SubscriptionPlanVersion {

    /**
     * Khóa chính ({@code version_id}).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "version_id")
    private Long id;

    /**
     * Mã gói (BASIC, STANDARD, EXTENDED).
     */
    @Column(name = "plan_code", nullable = false, length = 30)
    private String planCode;

    /**
     * Số version, tăng dần theo từng gói.
     */
    @Column(name = "version", nullable = false)
    private Integer version;

    /**
     * Trạng thái version (mặc định DRAFT).
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private VersionStatus status = VersionStatus.DRAFT;

    /**
     * Tên tiếng Việt.
     */
    @Column(name = "name_vi", nullable = false, length = 100)
    private String nameVi;

    /**
     * Tên tiếng Anh.
     */
    @Column(name = "name_en", nullable = false, length = 100)
    private String nameEn;

    /**
     * Mô tả tiếng Việt.
     */
    @Column(name = "description_vi", length = 500)
    private String descriptionVi;

    /**
     * Mô tả tiếng Anh.
     */
    @Column(name = "description_en", length = 500)
    private String descriptionEn;

    /**
     * Giá mua một lần (VND).
     */
    @Column(name = "purchase_price_vnd", nullable = false)
    private Long purchasePriceVnd = 0L;

    /**
     * Cột giá tháng cũ, chỉ đọc (không ghi), giữ cho dữ liệu legacy.
     */
    @Column(name = "monthly_price_vnd", insertable = false, updatable = false)
    private Long legacyMonthlyPriceVnd;
    public Long getLegacyMonthlyPriceVnd() { return legacyMonthlyPriceVnd; }

    /**
     * Mô hình thu phí; hiện chỉ {@code LIFETIME}.
     */
    @Column(name = "billing_model", nullable = false, length = 20)
    private String billingModel = "LIFETIME";

    /**
     * Số Asset tối đa.
     */
    @Column(name = "asset_limit", nullable = false)
    private Long assetLimit;

    /**
     * Tổng dung lượng lưu trữ tối đa (byte).
     */
    @Column(name = "storage_limit_bytes", nullable = false)
    private Long storageLimitBytes;

    /**
     * Dung lượng tối đa mỗi file (byte), cố định 10 MB.
     */
    @Column(name = "file_limit_bytes", nullable = false)
    private Long fileLimitBytes = 10485760L; // 10 MB standard

    /**
     * Token khóa lạc quan; client phải gửi lại khi sửa bản nháp.
     */
    @Version
    @Column(name = "concurrency_token", nullable = false)
    private Long concurrencyToken = 0L;

    /**
     * Admin tạo bản nháp.
     */
    @Column(name = "created_by_user_id")
    private Long createdByUserId;

    /**
     * Admin công bố version.
     */
    @Column(name = "published_by_user_id")
    private Long publishedByUserId;

    /**
     * Thời điểm tạo.
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    /**
     * Thời điểm sửa gần nhất, cập nhật trong {@link #onPreUpdate()}.
     */
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    /**
     * Thời điểm công bố.
     */
    @Column(name = "published_at")
    private Instant publishedAt;

    /**
     * Thời điểm ngừng.
     */
    @Column(name = "deprecated_at")
    private Instant deprecatedAt;

    /**
     * Ghi chú thay đổi của admin.
     */
    @Column(name = "change_note", length = 500)
    private String changeNote;

    /**
     * Trạng thái version: DRAFT (đang soạn), PUBLISHED (đang áp dụng), DEPRECATED (đã ngừng).
     */
    public enum VersionStatus {
        DRAFT,
        PUBLISHED,
        DEPRECATED
    }

    /**
     * Constructor mặc định (JPA và service tạo bản nháp).
     */
    public SubscriptionPlanVersion() {}

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getPlanCode() { return planCode; }
    public void setPlanCode(String planCode) { this.planCode = planCode; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public VersionStatus getStatus() { return status; }
    public void setStatus(VersionStatus status) { this.status = status; }

    public String getNameVi() { return nameVi; }
    public void setNameVi(String nameVi) { this.nameVi = nameVi; }

    public String getNameEn() { return nameEn; }
    public void setNameEn(String nameEn) { this.nameEn = nameEn; }

    public String getDescriptionVi() { return descriptionVi; }
    public void setDescriptionVi(String descriptionVi) { this.descriptionVi = descriptionVi; }

    public String getDescriptionEn() { return descriptionEn; }
    public void setDescriptionEn(String descriptionEn) { this.descriptionEn = descriptionEn; }

    public Long getPurchasePriceVnd() { return purchasePriceVnd; }
    public void setPurchasePriceVnd(Long purchasePriceVnd) { this.purchasePriceVnd = purchasePriceVnd; }

    public String getBillingModel() { return billingModel; }
    public void setBillingModel(String billingModel) { this.billingModel = billingModel; }

    public Long getAssetLimit() { return assetLimit; }
    public void setAssetLimit(Long assetLimit) { this.assetLimit = assetLimit; }

    public Long getStorageLimitBytes() { return storageLimitBytes; }
    public void setStorageLimitBytes(Long storageLimitBytes) { this.storageLimitBytes = storageLimitBytes; }

    public Long getFileLimitBytes() { return fileLimitBytes; }
    public void setFileLimitBytes(Long fileLimitBytes) { this.fileLimitBytes = fileLimitBytes; }

    public Long getConcurrencyToken() { return concurrencyToken; }
    public void setConcurrencyToken(Long concurrencyToken) { this.concurrencyToken = concurrencyToken; }

    public Long getCreatedByUserId() { return createdByUserId; }
    public void setCreatedByUserId(Long createdByUserId) { this.createdByUserId = createdByUserId; }

    public Long getPublishedByUserId() { return publishedByUserId; }
    public void setPublishedByUserId(Long publishedByUserId) { this.publishedByUserId = publishedByUserId; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public Instant getPublishedAt() { return publishedAt; }
    public void setPublishedAt(Instant publishedAt) { this.publishedAt = publishedAt; }

    public Instant getDeprecatedAt() { return deprecatedAt; }
    public void setDeprecatedAt(Instant deprecatedAt) { this.deprecatedAt = deprecatedAt; }

    public String getChangeNote() { return changeNote; }
    public void setChangeNote(String changeNote) { this.changeNote = changeNote; }

    /**
     * Callback JPA: cập nhật {@code updatedAt} = hiện tại.
     */
    @PreUpdate
    public void onPreUpdate() {
        this.updatedAt = Instant.now();
    }
}
