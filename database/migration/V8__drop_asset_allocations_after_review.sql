/*
 * LegacyVault - V8
 * Retire asset_allocations only after application references/FKs have been reviewed.
 *
 * Safety checks:
 * - Refuses to run if the old table contains any rows.
 * - Refuses to run if another table has a foreign key referencing it.
 * - If the table is already absent, the migration is a no-op.
 *
 * Before deploying this migration, update Entity/Repository/Service/DTO/API/tests
 * and all SQL references to use legal_basis_version_allocations.
 */

IF OBJECT_ID(N'dbo.asset_allocations', N'U') IS NOT NULL
BEGIN
    IF EXISTS (SELECT 1 FROM dbo.asset_allocations)
    BEGIN
        THROW 51001, 'Cannot drop dbo.asset_allocations: rows still exist. Migrate or explicitly archive them first.', 1;
    END;

    IF EXISTS (
        SELECT 1
        FROM sys.foreign_keys fk
        WHERE fk.referenced_object_id = OBJECT_ID(N'dbo.asset_allocations')
    )
    BEGIN
        THROW 51002, 'Cannot drop dbo.asset_allocations: foreign keys from other tables still reference it.', 1;
    END;

    DROP TABLE dbo.asset_allocations;
END;
