CREATE TABLE dbo.owner_subscription_entitlements (
 owner_user_id BIGINT NOT NULL CONSTRAINT PK_owner_subscription_entitlements PRIMARY KEY
   CONSTRAINT FK_owner_subscription_user REFERENCES dbo.users(user_id),
 plan_code NVARCHAR(30) NOT NULL CONSTRAINT FK_owner_subscription_plan REFERENCES dbo.subscription_plans(plan_code),
 catalog_version INT NOT NULL,
 purchase_price_vnd BIGINT NOT NULL,
 asset_limit BIGINT NOT NULL,
 storage_limit_bytes BIGINT NOT NULL,
 file_limit_bytes BIGINT NOT NULL,
 created_at DATETIME2 NOT NULL CONSTRAINT DF_owner_subscription_created DEFAULT SYSUTCDATETIME(),
 updated_at DATETIME2 NOT NULL CONSTRAINT DF_owner_subscription_updated DEFAULT SYSUTCDATETIME(),
 CONSTRAINT CK_owner_subscription_limits CHECK (catalog_version>0 AND purchase_price_vnd>=0
  AND asset_limit>0 AND storage_limit_bytes>0 AND file_limit_bytes>0 AND file_limit_bytes<=storage_limit_bytes)
);
