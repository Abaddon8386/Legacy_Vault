/* PS-77 approved 2026-10-17: binary MB/GB; all retained Assets and content versions count.
   Current EncryptionService uses AES/GCM/NoPadding with a separate IV and a 128-bit tag:
   ciphertext length = logical content length + 16. No content is decrypted or rewritten.
   A future encryption envelope change must also change this computed-size contract. */
IF EXISTS (SELECT 1 FROM dbo.assets WHERE encrypted_payload IS NOT NULL AND DATALENGTH(encrypted_payload) < 16)
    THROW 51779, 'Asset payload is shorter than the AES-GCM authentication tag. Review data before quota migration.', 1;

ALTER TABLE dbo.assets ADD CONSTRAINT CK_assets_payload_gcm_length
    CHECK (encrypted_payload IS NULL OR DATALENGTH(encrypted_payload) >= 16);

ALTER TABLE dbo.assets ADD payload_size_bytes AS (
    CASE WHEN encrypted_payload IS NULL THEN CONVERT(BIGINT, 0)
         ELSE CONVERT(BIGINT, DATALENGTH(encrypted_payload)) - CONVERT(BIGINT, 16) END
) PERSISTED;

CREATE TABLE dbo.subscription_plans (
    plan_code NVARCHAR(30) NOT NULL CONSTRAINT PK_subscription_plans PRIMARY KEY,
    catalog_version INT NOT NULL,
    monthly_price_vnd BIGINT NOT NULL,
    asset_limit BIGINT NOT NULL,
    storage_limit_bytes BIGINT NOT NULL,
    file_limit_bytes BIGINT NOT NULL,
    CONSTRAINT CK_subscription_plans_limits CHECK (
        catalog_version > 0 AND monthly_price_vnd >= 0 AND asset_limit > 0
        AND storage_limit_bytes > 0 AND file_limit_bytes > 0 AND file_limit_bytes <= storage_limit_bytes
    )
);

INSERT INTO dbo.subscription_plans
    (plan_code, catalog_version, monthly_price_vnd, asset_limit, storage_limit_bytes, file_limit_bytes)
VALUES
    (N'BASIC', 1, 0, 5, 104857600, 10485760),
    (N'STANDARD', 1, 29000, 50, 1073741824, 10485760),
    (N'EXTENDED', 1, 59000, 200, 5368709120, 10485760);

/* All Owners have BASIC by default, including existing Owners without a Vault.
   Paid assignments/periods/evidence policy have not been approved; no grant table,
   write endpoint, role seed or automatic paid entitlement is introduced here. */
