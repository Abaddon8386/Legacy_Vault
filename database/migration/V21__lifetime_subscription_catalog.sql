/* PS-77: confirmed lifetime pricing, 2026-10-17. V20 is retained unchanged.
   Preserve its historical monthly-price column; new code uses only the explicitly approved purchase price.
   Do not silently reinterpret an unknown/custom catalog as the three reviewed plans. */
IF (SELECT COUNT_BIG(*) FROM dbo.subscription_plans) <> 3
   OR EXISTS (SELECT 1 FROM dbo.subscription_plans
              WHERE plan_code NOT IN (N'BASIC', N'STANDARD', N'EXTENDED') OR catalog_version <> 1)
    THROW 51810, 'Unexpected subscription catalog. Review data before lifetime pricing migration.', 1;

ALTER TABLE dbo.subscription_plans ADD purchase_price_vnd BIGINT NULL, billing_model NVARCHAR(20) NULL;
GO
UPDATE dbo.subscription_plans
SET purchase_price_vnd = CASE plan_code WHEN N'BASIC' THEN 0 WHEN N'STANDARD' THEN 199000 WHEN N'EXTENDED' THEN 499000 END,
    billing_model = N'LIFETIME', catalog_version = 2;

ALTER TABLE dbo.subscription_plans ALTER COLUMN purchase_price_vnd BIGINT NOT NULL;
ALTER TABLE dbo.subscription_plans ALTER COLUMN billing_model NVARCHAR(20) NOT NULL;
ALTER TABLE dbo.subscription_plans ADD CONSTRAINT CK_subscription_plans_lifetime_price
    CHECK (purchase_price_vnd >= 0 AND billing_model = N'LIFETIME');
