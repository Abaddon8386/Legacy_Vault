package com.legacyvault.subscription.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;

/** Read-only, migration-managed catalog. Catalog presence never grants paid access. */
@Entity
@Immutable
@Table(name = "subscription_plans", schema = "dbo")
public class SubscriptionPlan {
    @Id
    @Column(name = "plan_code")
    private String code;
    @Column(name = "catalog_version")
    private int version;
    @Column(name = "monthly_price_vnd")
    private long monthlyPriceVnd;
    @Column(name = "asset_limit")
    private long assetLimit;
    @Column(name = "storage_limit_bytes")
    private long storageLimitBytes;
    @Column(name = "file_limit_bytes")
    private long fileLimitBytes;

    protected SubscriptionPlan() {}

    public String getCode() { return code; }
    public int getVersion() { return version; }
    public long getMonthlyPriceVnd() { return monthlyPriceVnd; }
    public long getAssetLimit() { return assetLimit; }
    public long getStorageLimitBytes() { return storageLimitBytes; }
    public long getFileLimitBytes() { return fileLimitBytes; }
}
