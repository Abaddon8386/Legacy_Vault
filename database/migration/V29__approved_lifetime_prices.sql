/* User decision 2026-10-19: lifetime 499k/999k; upgrades pay the FULL target price.
   V20..V28 are preserved. Existing entitlement/transaction snapshots are never upgraded by this migration. */
ALTER TABLE dbo.subscription_plan_versions DROP CONSTRAINT CK_sub_plan_version_billing;
ALTER TABLE dbo.subscription_plan_versions ADD purchase_price_vnd BIGINT NOT NULL
    CONSTRAINT DF_sub_ver_purchase DEFAULT (0);
GO
ALTER TABLE dbo.subscription_plan_versions ADD CONSTRAINT CK_sub_ver_purchase CHECK (purchase_price_vnd >= 0);
ALTER TABLE dbo.subscription_plan_versions ADD CONSTRAINT CK_sub_ver_billing_history
    CHECK (billing_model IN (N'MONTHLY', N'LIFETIME'));
ALTER TABLE dbo.subscription_plans ADD is_available BIT NOT NULL CONSTRAINT DF_sub_plan_available DEFAULT (1);
GO
-- Preserve old configurations as history; create a new published configuration for each approved tier.
UPDATE dbo.subscription_plan_versions SET status=N'DEPRECATED', deprecated_at=SYSUTCDATETIME(),
    concurrency_token=concurrency_token+1 WHERE status IN (N'PUBLISHED', N'DRAFT');

INSERT INTO dbo.subscription_plan_versions
    (plan_code,version,status,name_vi,name_en,description_vi,description_en,
     monthly_price_vnd,purchase_price_vnd,billing_model,asset_limit,storage_limit_bytes,file_limit_bytes,
     concurrency_token,published_at,change_note)
SELECT p.plan_code, COALESCE((SELECT MAX(v.version) FROM dbo.subscription_plan_versions v WHERE v.plan_code=p.plan_code),0)+1,
    N'PUBLISHED',
    CASE p.plan_code WHEN N'BASIC' THEN N'Cơ bản' WHEN N'STANDARD' THEN N'Tiêu chuẩn' ELSE N'Mở rộng' END,
    CASE p.plan_code WHEN N'BASIC' THEN N'Basic' WHEN N'STANDARD' THEN N'Standard' ELSE N'Extended' END,
    N'Mua một lần, sử dụng trọn đời. Nâng cấp trả toàn bộ giá gói đích.',
    N'One-time purchase, lifetime use. Upgrades pay the full target price.',
    0,CASE p.plan_code WHEN N'BASIC' THEN 0 WHEN N'STANDARD' THEN 499000 ELSE 999000 END,N'LIFETIME',
    p.asset_limit,p.storage_limit_bytes,10485760,0,SYSUTCDATETIME(),N'User-approved lifetime pricing, 2026-10-19'
FROM dbo.subscription_plans p WHERE p.plan_code IN (N'BASIC',N'STANDARD',N'EXTENDED');

UPDATE p SET p.purchase_price_vnd=v.purchase_price_vnd,p.billing_model=N'LIFETIME',
    p.catalog_version=v.version,p.is_available=1
FROM dbo.subscription_plans p JOIN dbo.subscription_plan_versions v ON v.plan_code=p.plan_code AND v.status=N'PUBLISHED';
