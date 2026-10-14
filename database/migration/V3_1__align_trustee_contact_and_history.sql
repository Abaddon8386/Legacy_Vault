/* PS-19: allow email-only contacts and retain revoked Trustee appointments. */
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = N'UQ_trustees_vault'
        AND parent_object_id = OBJECT_ID(N'dbo.trustees'))
BEGIN
    ALTER TABLE dbo.trustees DROP CONSTRAINT UQ_trustees_vault;
END;

ALTER TABLE dbo.trustees ALTER COLUMN phone_number NVARCHAR(20) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_trustees_contact'
        AND parent_object_id = OBJECT_ID(N'dbo.trustees'))
BEGIN
    ALTER TABLE dbo.trustees ADD CONSTRAINT CK_trustees_contact CHECK (
        NULLIF(LTRIM(RTRIM(phone_number)), N'') IS NOT NULL
        OR NULLIF(LTRIM(RTRIM(email)), N'') IS NOT NULL
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_trustees_vault_appointed'
        AND object_id = OBJECT_ID(N'dbo.trustees'))
BEGIN
    CREATE UNIQUE INDEX UX_trustees_vault_appointed
        ON dbo.trustees(vault_id)
        WHERE status = N'APPOINTED';
END;
