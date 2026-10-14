/*
    LegacyVault - V2: Upgrade V1 schema to the latest UUID Data Dictionary
    Database: Microsoft SQL Server
    Flyway version: V2

    Prerequisite:
      - The project's V1 schema migration has been applied successfully.
      - Run this migration through Flyway, not by manually executing fragments.

    Changes:
      1. Add/backfill public_id on resource tables while retaining BIGINT PK/FK.
      2. Add users.deleted_at for soft deletion.
      3. Add beneficiaries.date_of_birth and beneficiaries.relationship_to_owner.
      4. Add legal_documents.current_verification_id and its FK after both tables exist.
      5. Add DEFAULT NEWID() to each public_id for seed/manual INSERT compatibility.
      6. Preserve Trustee history with one active APPOINTED Trustee per Vault and
         require at least one contact method.
      7. Set the DMS grace-period default to one day.
      8. Add nullable trustees.note for Owner-provided instructions.

    Notes:
      - UUIDs for existing records are backfilled with NEWID(). DEFAULT NEWID()
        constraints also support SQL seed/manual INSERTs that omit public_id.
        The application may still assign UUID.randomUUID() explicitly.
      - New beneficiary fields remain NULL-compatible for existing rows. Validate them
        in DTO/Service for new/updated beneficiary records according to business rules.
      - The V1 legal_verifications.asset_version_id column is retained for compatibility;
        this migration does not destructively drop existing data/columns.
      - Do not rename or edit this migration after it has been applied in a shared DB.
*/
SET XACT_ABORT ON;

/* Fail early if the expected V1 schema is not present. */
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
   OR OBJECT_ID(N'dbo.vaults', N'U') IS NULL
   OR OBJECT_ID(N'dbo.assets', N'U') IS NULL
   OR OBJECT_ID(N'dbo.asset_versions', N'U') IS NULL
   OR OBJECT_ID(N'dbo.trustees', N'U') IS NULL
   OR OBJECT_ID(N'dbo.beneficiaries', N'U') IS NULL
   OR OBJECT_ID(N'dbo.asset_allocations', N'U') IS NULL
   OR OBJECT_ID(N'dbo.dms_configs', N'U') IS NULL
   OR OBJECT_ID(N'dbo.legal_documents', N'U') IS NULL
   OR OBJECT_ID(N'dbo.legal_verifications', N'U') IS NULL
BEGIN
    THROW 51100, 'V2 requires the V1 LegacyVault schema. One or more required tables are missing.', 1;
END;

/* 1. users.public_id */
IF COL_LENGTH(N'dbo.users', N'public_id') IS NULL
    ALTER TABLE dbo.users ADD public_id UNIQUEIDENTIFIER NULL;
EXEC sys.sp_executesql N'UPDATE dbo.users SET public_id = NEWID() WHERE public_id IS NULL;';
EXEC sys.sp_executesql N'ALTER TABLE dbo.users ALTER COLUMN public_id UNIQUEIDENTIFIER NOT NULL;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.users') AND name = N'UX_users_public_id')
    CREATE UNIQUE INDEX UX_users_public_id ON dbo.users(public_id);

/* 2. vaults.public_id */
IF COL_LENGTH(N'dbo.vaults', N'public_id') IS NULL
    ALTER TABLE dbo.vaults ADD public_id UNIQUEIDENTIFIER NULL;
EXEC sys.sp_executesql N'UPDATE dbo.vaults SET public_id = NEWID() WHERE public_id IS NULL;';
EXEC sys.sp_executesql N'ALTER TABLE dbo.vaults ALTER COLUMN public_id UNIQUEIDENTIFIER NOT NULL;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.vaults') AND name = N'UX_vaults_public_id')
    CREATE UNIQUE INDEX UX_vaults_public_id ON dbo.vaults(public_id);

/* 3. assets.public_id */
IF COL_LENGTH(N'dbo.assets', N'public_id') IS NULL
    ALTER TABLE dbo.assets ADD public_id UNIQUEIDENTIFIER NULL;
EXEC sys.sp_executesql N'UPDATE dbo.assets SET public_id = NEWID() WHERE public_id IS NULL;';
EXEC sys.sp_executesql N'ALTER TABLE dbo.assets ALTER COLUMN public_id UNIQUEIDENTIFIER NOT NULL;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.assets') AND name = N'UX_assets_public_id')
    CREATE UNIQUE INDEX UX_assets_public_id ON dbo.assets(public_id);

/* 4. asset_versions.public_id */
IF COL_LENGTH(N'dbo.asset_versions', N'public_id') IS NULL
    ALTER TABLE dbo.asset_versions ADD public_id UNIQUEIDENTIFIER NULL;
EXEC sys.sp_executesql N'UPDATE dbo.asset_versions SET public_id = NEWID() WHERE public_id IS NULL;';
EXEC sys.sp_executesql N'ALTER TABLE dbo.asset_versions ALTER COLUMN public_id UNIQUEIDENTIFIER NOT NULL;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.asset_versions') AND name = N'UX_asset_versions_public_id')
    CREATE UNIQUE INDEX UX_asset_versions_public_id ON dbo.asset_versions(public_id);

/* 5. trustees.public_id */
IF COL_LENGTH(N'dbo.trustees', N'public_id') IS NULL
    ALTER TABLE dbo.trustees ADD public_id UNIQUEIDENTIFIER NULL;
EXEC sys.sp_executesql N'UPDATE dbo.trustees SET public_id = NEWID() WHERE public_id IS NULL;';
EXEC sys.sp_executesql N'ALTER TABLE dbo.trustees ALTER COLUMN public_id UNIQUEIDENTIFIER NOT NULL;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.trustees') AND name = N'UX_trustees_public_id')
    CREATE UNIQUE INDEX UX_trustees_public_id ON dbo.trustees(public_id);

/* 6. beneficiaries.public_id */
IF COL_LENGTH(N'dbo.beneficiaries', N'public_id') IS NULL
    ALTER TABLE dbo.beneficiaries ADD public_id UNIQUEIDENTIFIER NULL;
EXEC sys.sp_executesql N'UPDATE dbo.beneficiaries SET public_id = NEWID() WHERE public_id IS NULL;';
EXEC sys.sp_executesql N'ALTER TABLE dbo.beneficiaries ALTER COLUMN public_id UNIQUEIDENTIFIER NOT NULL;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.beneficiaries') AND name = N'UX_beneficiaries_public_id')
    CREATE UNIQUE INDEX UX_beneficiaries_public_id ON dbo.beneficiaries(public_id);

/* 7. asset_allocations.public_id */
IF COL_LENGTH(N'dbo.asset_allocations', N'public_id') IS NULL
    ALTER TABLE dbo.asset_allocations ADD public_id UNIQUEIDENTIFIER NULL;
EXEC sys.sp_executesql N'UPDATE dbo.asset_allocations SET public_id = NEWID() WHERE public_id IS NULL;';
EXEC sys.sp_executesql N'ALTER TABLE dbo.asset_allocations ALTER COLUMN public_id UNIQUEIDENTIFIER NOT NULL;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.asset_allocations') AND name = N'UX_asset_allocations_public_id')
    CREATE UNIQUE INDEX UX_asset_allocations_public_id ON dbo.asset_allocations(public_id);

/* 8. dms_configs.public_id */
IF COL_LENGTH(N'dbo.dms_configs', N'public_id') IS NULL
    ALTER TABLE dbo.dms_configs ADD public_id UNIQUEIDENTIFIER NULL;
EXEC sys.sp_executesql N'UPDATE dbo.dms_configs SET public_id = NEWID() WHERE public_id IS NULL;';
EXEC sys.sp_executesql N'ALTER TABLE dbo.dms_configs ALTER COLUMN public_id UNIQUEIDENTIFIER NOT NULL;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.dms_configs') AND name = N'UX_dms_configs_public_id')
    CREATE UNIQUE INDEX UX_dms_configs_public_id ON dbo.dms_configs(public_id);

/* 9. legal_documents.public_id */
IF COL_LENGTH(N'dbo.legal_documents', N'public_id') IS NULL
    ALTER TABLE dbo.legal_documents ADD public_id UNIQUEIDENTIFIER NULL;
EXEC sys.sp_executesql N'UPDATE dbo.legal_documents SET public_id = NEWID() WHERE public_id IS NULL;';
EXEC sys.sp_executesql N'ALTER TABLE dbo.legal_documents ALTER COLUMN public_id UNIQUEIDENTIFIER NOT NULL;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.legal_documents') AND name = N'UX_legal_documents_public_id')
    CREATE UNIQUE INDEX UX_legal_documents_public_id ON dbo.legal_documents(public_id);

/* 10. legal_verifications.public_id */
IF COL_LENGTH(N'dbo.legal_verifications', N'public_id') IS NULL
    ALTER TABLE dbo.legal_verifications ADD public_id UNIQUEIDENTIFIER NULL;
EXEC sys.sp_executesql N'UPDATE dbo.legal_verifications SET public_id = NEWID() WHERE public_id IS NULL;';
EXEC sys.sp_executesql N'ALTER TABLE dbo.legal_verifications ALTER COLUMN public_id UNIQUEIDENTIFIER NOT NULL;';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.legal_verifications') AND name = N'UX_legal_verifications_public_id')
    CREATE UNIQUE INDEX UX_legal_verifications_public_id ON dbo.legal_verifications(public_id);

/* 11. Soft delete on users. */
IF COL_LENGTH(N'dbo.users', N'deleted_at') IS NULL
    ALTER TABLE dbo.users ADD deleted_at DATETIME2 NULL;

/* 12. Beneficiary details. Nullable to preserve existing rows. */
IF COL_LENGTH(N'dbo.beneficiaries', N'date_of_birth') IS NULL
    ALTER TABLE dbo.beneficiaries ADD date_of_birth DATE NULL;

IF COL_LENGTH(N'dbo.beneficiaries', N'relationship_to_owner') IS NULL
    ALTER TABLE dbo.beneficiaries ADD relationship_to_owner NVARCHAR(100) NULL;

/* 13. Optional pointer to the current verification; add FK after both tables exist. */
IF COL_LENGTH(N'dbo.legal_documents', N'current_verification_id') IS NULL
    ALTER TABLE dbo.legal_documents ADD current_verification_id BIGINT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_legal_documents_current_verification')
BEGIN
    ALTER TABLE dbo.legal_documents WITH CHECK
        ADD CONSTRAINT FK_legal_documents_current_verification
        FOREIGN KEY (current_verification_id)
        REFERENCES dbo.legal_verifications(verification_id);
END;


/* 14. Defaults for public_id.
   The seed and manual INSERT scripts may omit public_id; NEWID() fills it.
   Application code may still supply a UUID explicitly. */
DECLARE @PublicIdDefaults TABLE (table_name SYSNAME PRIMARY KEY);
INSERT INTO @PublicIdDefaults(table_name)
VALUES (N'users'), (N'vaults'), (N'assets'), (N'asset_versions'), (N'trustees'),
       (N'beneficiaries'), (N'asset_allocations'), (N'dms_configs'),
       (N'legal_documents'), (N'legal_verifications');

DECLARE @TableName SYSNAME, @Sql NVARCHAR(MAX);
DECLARE public_id_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT table_name FROM @PublicIdDefaults;
OPEN public_id_cursor;
FETCH NEXT FROM public_id_cursor INTO @TableName;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF COL_LENGTH(N'dbo.' + @TableName, N'public_id') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM sys.default_constraints dc
           JOIN sys.columns c ON c.object_id = dc.parent_object_id
                             AND c.column_id = dc.parent_column_id
           WHERE dc.parent_object_id = OBJECT_ID(N'dbo.' + @TableName)
             AND c.name = N'public_id'
       )
    BEGIN
        SET @Sql = N'ALTER TABLE dbo.' + QUOTENAME(@TableName)
                 + N' ADD CONSTRAINT ' + QUOTENAME(N'DF_' + @TableName + N'_public_id')
                 + N' DEFAULT NEWID() FOR public_id;';
        EXEC sys.sp_executesql @Sql;
    END;
    FETCH NEXT FROM public_id_cursor INTO @TableName;
END;
CLOSE public_id_cursor;
DEALLOCATE public_id_cursor;

/* Add optional Owner-provided note/instructions for the Trustee. */
IF COL_LENGTH(N'dbo.trustees', N'note') IS NULL
    ALTER TABLE dbo.trustees ADD note NVARCHAR(255) NULL;

/* 15. Trustee history: only one currently appointed Trustee per Vault.
   Preserve revoked rows instead of enforcing UNIQUE(vault_id) across history. */
IF EXISTS (
    SELECT 1 FROM sys.key_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.trustees')
      AND name = N'UQ_trustees_vault'
)
    ALTER TABLE dbo.trustees DROP CONSTRAINT UQ_trustees_vault;

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.trustees')
      AND name = N'UQ_trustees_vault'
      AND is_unique = 1
)
    DROP INDEX UQ_trustees_vault ON dbo.trustees;

IF EXISTS (
    SELECT 1
    FROM dbo.trustees
    WHERE status = N'APPOINTED'
    GROUP BY vault_id
    HAVING COUNT_BIG(*) > 1
)
    THROW 51031, 'Cannot create active Trustee unique index: more than one APPOINTED Trustee exists for a Vault. Resolve duplicate active records first.', 1;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.trustees')
      AND name = N'UX_trustees_vault_active'
)
    CREATE UNIQUE INDEX UX_trustees_vault_active
        ON dbo.trustees(vault_id)
        WHERE status = N'APPOINTED';

/* A Trustee must have at least one contact method; either field may be NULL. */
ALTER TABLE dbo.trustees ALTER COLUMN phone_number NVARCHAR(20) NULL;

IF EXISTS (
    SELECT 1 FROM dbo.trustees
    WHERE phone_number IS NULL AND email IS NULL
)
    THROW 51032, 'Cannot add Trustee contact constraint: existing Trustee row has neither phone_number nor email. Fix the row before rerunning migration.', 1;

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id = OBJECT_ID(N'dbo.trustees')
      AND name = N'CK_trustees_phone_or_email'
)
    ALTER TABLE dbo.trustees
        ADD CONSTRAINT CK_trustees_phone_or_email
        CHECK (phone_number IS NOT NULL OR email IS NOT NULL);

/* Grace period defaults to one day; Owner may change it through the application. */
IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.object_id = dc.parent_object_id
                      AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID(N'dbo.dms_configs')
      AND c.name = N'grace_period_days'
)
    ALTER TABLE dbo.dms_configs
        ADD CONSTRAINT DF_dms_configs_grace_period_days
        DEFAULT (1) FOR grace_period_days;


/* End V2. Flyway records this migration in dbo.flyway_schema_history. */
