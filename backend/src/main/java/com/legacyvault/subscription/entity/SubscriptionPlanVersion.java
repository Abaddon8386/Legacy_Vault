package com.legacyvault.subscription.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(
    name = "subscription_plan_versions",
    schema = "dbo",
    uniqueConstraints = {
        @UniqueConstraint(name = "UQ_sub_plan_code_version", columnNames = {"plan_code", "version"})
    }
)
public class SubscriptionPlanVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "version_id")
    private Long id;

    @Column(name = "plan_code", nullable = false, length = 30)
    private String planCode;

    @Column(name = "version", nullable = false)
    private Integer version;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private VersionStatus status = VersionStatus.DRAFT;

    @Column(name = "name_vi", nullable = false, length = 100)
    private String nameVi;

    @Column(name = "name_en", nullable = false, length = 100)
    private String nameEn;

    @Column(name = "description_vi", length = 500)
    private String descriptionVi;

    @Column(name = "description_en", length = 500)
    private String descriptionEn;

    @Column(name = "purchase_price_vnd", nullable = false)
    private Long purchasePriceVnd = 0L;

    @Column(name = "monthly_price_vnd", insertable = false, updatable = false)
    private Long legacyMonthlyPriceVnd;
    public Long getLegacyMonthlyPriceVnd() { return legacyMonthlyPriceVnd; }

    @Column(name = "billing_model", nullable = false, length = 20)
    private String billingModel = "LIFETIME";

    @Column(name = "asset_limit", nullable = false)
    private Long assetLimit;

    @Column(name = "storage_limit_bytes", nullable = false)
    private Long storageLimitBytes;

    @Column(name = "file_limit_bytes", nullable = false)
    private Long fileLimitBytes = 10485760L; // 10 MB standard

    @Version
    @Column(name = "concurrency_token", nullable = false)
    private Long concurrencyToken = 0L;

    @Column(name = "created_by_user_id")
    private Long createdByUserId;

    @Column(name = "published_by_user_id")
    private Long publishedByUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "published_at")
    private Instant publishedAt;

    @Column(name = "deprecated_at")
    private Instant deprecatedAt;

    @Column(name = "change_note", length = 500)
    private String changeNote;

    public enum VersionStatus {
        DRAFT,
        PUBLISHED,
        DEPRECATED
    }

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

    @PreUpdate
    public void onPreUpdate() {
        this.updatedAt = Instant.now();
    }
}
