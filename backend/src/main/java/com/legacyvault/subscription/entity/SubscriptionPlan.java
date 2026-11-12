package com.legacyvault.subscription.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

/**
 * Catalog gói đăng ký chỉ-đọc (bảng {@code dbo.subscription_plans}), do migration quản lý và được {@code AdminSubscriptionService.publishVersion}
 * đồng bộ qua câu lệnh native. Có trong catalog không đồng nghĩa được cấp quyền trả phí. Được {@code OwnerQuotaService}, {@code PaymentService},
 * {@code SubscriptionUpgradeService} đọc.
 *
 * <ul>
 * <li>{@code code} - mã gói (BASIC, STANDARD, EXTENDED); {@code version} - version catalog</li>
 * <li>{@code priceVnd}, {@code billingModel} - giá mua một lần và mô hình thu phí</li>
 * <li>{@code assetLimit}, {@code storageLimitBytes}, {@code fileLimitBytes} - giới hạn</li>
 * <li>{@code available} - gói còn bán hay đã ngừng</li>
 * </ul>
 */
@Entity
@Immutable
@Table(name = "subscription_plans", schema = "dbo")
public class SubscriptionPlan {
    @Id
    @Column(name = "plan_code")
    private String code;
    @Column(name = "catalog_version")
    private int version;
    @Column(name = "purchase_price_vnd")
    private long priceVnd;
    @Column(name = "billing_model")
    private String billingModel;
    @Column(name = "asset_limit")
    private long assetLimit;
    @Column(name = "storage_limit_bytes")
    private long storageLimitBytes;
    @Column(name = "file_limit_bytes")
    private long fileLimitBytes;

    @Column(name="is_available")
    private boolean available = true;
    /**
     * @return true nếu gói còn khả dụng để mua
     */
    public boolean isAvailable() { return available; }

    /**
     * Constructor không tham số cho JPA.
     */
    protected SubscriptionPlan() {}

    public String getCode() { return code; }
    public int getVersion() { return version; }
    public long getPriceVnd() { return priceVnd; }
    public String getBillingModel() { return billingModel; }
    public long getAssetLimit() { return assetLimit; }
    public long getStorageLimitBytes() { return storageLimitBytes; }
    public long getFileLimitBytes() { return fileLimitBytes; }
}
