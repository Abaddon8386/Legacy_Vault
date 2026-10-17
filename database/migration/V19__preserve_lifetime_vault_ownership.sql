/* PS-77: one successfully created Vault per Owner for the entire account lifetime.
   Keep the unfiltered unique Owner key from V1 and preserve Vault rows/ownership.
   This migration neither removes data nor defines subscription/quota/legal policy.
   Runtime credentials must not have ALTER/CONTROL permissions that bypass triggers. */

IF OBJECT_ID(N'dbo.vaults', N'U') IS NULL
    THROW 51774, 'PS-77 requires dbo.vaults. No data was changed.', 1;

IF EXISTS (
    SELECT owner_user_id FROM dbo.vaults GROUP BY owner_user_id HAVING COUNT_BIG(*) > 1
)
    THROW 51775, 'Multiple Vaults exist for an Owner. Report and review; do not merge or delete rows.', 1;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID(N'dbo.vaults')
      AND i.is_unique = 1 AND i.has_filter = 0 AND i.is_disabled = 0 AND i.is_hypothetical = 0
      AND (SELECT COUNT(*) FROM sys.index_columns ic
           WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal > 0) = 1
      AND EXISTS (
          SELECT 1 FROM sys.index_columns ic
          JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
          WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
            AND ic.key_ordinal = 1 AND c.name = N'owner_user_id'
      )
)
    THROW 51776, 'An enabled unfiltered unique Owner key is required. Review schema before deploying PS-77.', 1;

GO

CREATE TRIGGER dbo.TR_vaults_preserve_lifetime_record
ON dbo.vaults
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
        THROW 51777, 'Vault records must be retained for the Owner lifetime; physical deletion is prohibited.', 1;
END;

GO

CREATE TRIGGER dbo.TR_vaults_immutable_owner
ON dbo.vaults
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM inserted i
        JOIN deleted d ON d.vault_id = i.vault_id
        WHERE i.owner_user_id <> d.owner_user_id
    )
        THROW 51778, 'The Owner of a successfully created Vault cannot be reassigned.', 1;
END;
