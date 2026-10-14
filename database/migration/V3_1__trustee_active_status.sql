/* Store the active Trustee as ACTIVE while the API exposes APPOINTED. */
SET XACT_ABORT ON;

IF EXISTS (
    SELECT 1
    FROM dbo.trustees
    WHERE status IN (N'APPOINTED', N'ACTIVE')
    GROUP BY vault_id
    HAVING COUNT_BIG(*) > 1
)
    THROW 51033, 'Cannot migrate Trustee statuses: more than one active Trustee exists for a Vault.', 1;

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.trustees')
      AND name = N'UX_trustees_vault_active'
)
    DROP INDEX UX_trustees_vault_active ON dbo.trustees;

UPDATE dbo.trustees
SET status = N'ACTIVE'
WHERE status = N'APPOINTED';

IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.trustees')
      AND name = N'DF_trustees_status'
)
    ALTER TABLE dbo.trustees DROP CONSTRAINT DF_trustees_status;

ALTER TABLE dbo.trustees
    ADD CONSTRAINT DF_trustees_status DEFAULT N'ACTIVE' FOR status;

CREATE UNIQUE INDEX UX_trustees_vault_active
    ON dbo.trustees(vault_id)
    WHERE status = N'ACTIVE';
