/*
 * PS-77 diagnostic only. Run explicitly with sqlcmd -b (see README.md).
 * Outside Flyway migration locations. No DDL, DML, decryption or data repair.
 * Results are separate READ COMMITTED observations, not one consistent usage snapshot.
 * Run off-peak: COUNT/SUM/DATALENGTH may scan tables/LOBs and take shared locks.
 * No asset-count/storage policy or MB/GB conversion is assumed.
 */
SET NOCOUNT ON;
SET LOCK_TIMEOUT 5000;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

SELECT N'context' AS section, DB_NAME() AS database_name,
       SYSUTCDATETIME() AS observed_at_utc,
       CONVERT(nvarchar(128), SERVERPROPERTY('ProductVersion')) AS sql_server_version;

-- Missing metadata permissions can also make these checks fail. Do not interpret that as empty data.
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
   OR OBJECT_ID(N'dbo.roles', N'U') IS NULL
   OR OBJECT_ID(N'dbo.user_roles', N'U') IS NULL
   OR OBJECT_ID(N'dbo.vaults', N'U') IS NULL
   OR OBJECT_ID(N'dbo.assets', N'U') IS NULL
   OR OBJECT_ID(N'dbo.asset_versions', N'U') IS NULL
   OR COL_LENGTH(N'dbo.users', N'deleted_at') IS NULL
    THROW 51770, 'PS-77 requires the V1/V2 baseline and metadata visibility; no changes were made.', 1;

SELECT N'owner_role_definition' AS section, COUNT_BIG(*) AS owner_role_rows
FROM dbo.roles WHERE role_code = N'ROLE_VAULT_OWNER';

SELECT N'row_totals' AS section,
       (SELECT COUNT_BIG(*) FROM dbo.users) AS users,
       (SELECT COUNT_BIG(*) FROM dbo.users u WHERE EXISTS (
           SELECT 1 FROM dbo.user_roles ur JOIN dbo.roles r ON r.role_id = ur.role_id
           WHERE ur.user_id = u.user_id AND r.role_code = N'ROLE_VAULT_OWNER')) AS owners,
       (SELECT COUNT_BIG(*) FROM dbo.vaults) AS vaults,
       (SELECT COUNT_BIG(*) FROM dbo.assets) AS assets,
       (SELECT COUNT_BIG(*) FROM dbo.asset_versions) AS asset_versions;

-- EXISTS avoids multiplying a user by role assignments. Include inactive/deleted users for inventory.
SELECT N'owners_by_status' AS section, u.status,
       CASE WHEN u.deleted_at IS NULL THEN 0 ELSE 1 END AS soft_deleted,
       COUNT_BIG(*) AS owners,
       SUM(CONVERT(bigint, CASE WHEN v.owner_user_id IS NULL THEN 1 ELSE 0 END)) AS without_vault,
       SUM(CONVERT(bigint, CASE WHEN v.owner_user_id IS NOT NULL THEN 1 ELSE 0 END)) AS with_vault
FROM dbo.users u
LEFT JOIN (SELECT DISTINCT owner_user_id FROM dbo.vaults) v ON v.owner_user_id = u.user_id
WHERE EXISTS (SELECT 1 FROM dbo.user_roles ur JOIN dbo.roles r ON r.role_id = ur.role_id
              WHERE ur.user_id = u.user_id AND r.role_code = N'ROLE_VAULT_OWNER')
GROUP BY u.status, CASE WHEN u.deleted_at IS NULL THEN 0 ELSE 1 END;

SELECT N'vaults_by_status' AS section, status, COUNT_BIG(*) AS vaults
FROM dbo.vaults GROUP BY status;

SELECT N'vault_owner_anomalies' AS section,
       (SELECT COUNT_BIG(*) FROM dbo.vaults v
        WHERE NOT EXISTS (SELECT 1 FROM dbo.users u WHERE u.user_id = v.owner_user_id)) AS missing_user,
       (SELECT COUNT_BIG(*) FROM dbo.vaults v
        WHERE NOT EXISTS (SELECT 1 FROM dbo.user_roles ur JOIN dbo.roles r ON r.role_id = ur.role_id
                          WHERE ur.user_id = v.owner_user_id AND r.role_code = N'ROLE_VAULT_OWNER')) AS missing_owner_role;

DECLARE @duplicate_owners bigint = (
    SELECT COUNT_BIG(*) FROM (
        SELECT owner_user_id FROM dbo.vaults GROUP BY owner_user_id HAVING COUNT_BIG(*) > 1
    ) duplicates
);
DECLARE @global_owner_unique bit = CASE WHEN EXISTS (
    SELECT 1 FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.object_id = OBJECT_ID(N'dbo.vaults') AND i.is_unique = 1
      AND i.is_disabled = 0 AND i.is_hypothetical = 0 AND i.has_filter = 0
      AND ic.key_ordinal = 1 AND c.name = N'owner_user_id'
      AND (SELECT COUNT(*) FROM sys.index_columns k
           WHERE k.object_id = i.object_id AND k.index_id = i.index_id AND k.key_ordinal > 0) = 1
) THEN 1 ELSE 0 END;

SELECT N'lifetime_vault_prerequisites' AS section, @duplicate_owners AS duplicate_owner_groups,
       @global_owner_unique AS enabled_unfiltered_owner_unique,
       N'Unique does not prove hard-delete/owner-transfer protection' AS limitation;

-- Inventory index keys/includes rather than recommending duplicate indexes.
SELECT N'index_columns' AS section, OBJECT_NAME(i.object_id) AS table_name,
       i.name AS index_name, i.is_unique, i.is_disabled, i.has_filter,
       c.name AS column_name, ic.key_ordinal, ic.is_included_column
FROM sys.indexes i
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.object_id IN (OBJECT_ID(N'dbo.vaults'), OBJECT_ID(N'dbo.assets'), OBJECT_ID(N'dbo.asset_versions'))
ORDER BY table_name, index_name, ic.key_ordinal, ic.index_column_id;

SELECT N'foreign_keys' AS section, OBJECT_NAME(parent_object_id) AS table_name,
       name, is_disabled, is_not_trusted, delete_referential_action_desc, update_referential_action_desc
FROM sys.foreign_keys
WHERE parent_object_id IN (OBJECT_ID(N'dbo.vaults'), OBJECT_ID(N'dbo.assets'), OBJECT_ID(N'dbo.asset_versions'));

-- Presence/enabled state alone does not prove trigger behavior. No DELETE/UPDATE probes are performed.
SELECT N'vault_trigger_inventory' AS section, t.name, t.is_disabled, t.is_instead_of_trigger,
       e.type_desc AS trigger_event
FROM sys.triggers t JOIN sys.trigger_events e ON e.object_id = t.object_id
WHERE t.parent_id = OBJECT_ID(N'dbo.vaults');

SELECT N'current_principal_vault_permissions' AS section,
       HAS_PERMS_BY_NAME(N'dbo.vaults', N'OBJECT', N'DELETE') AS can_delete,
       HAS_PERMS_BY_NAME(N'dbo.vaults', N'OBJECT', N'UPDATE') AS can_update,
       N'Current diagnostic principal; may differ from application runtime principal' AS limitation;

-- Dynamic SQL keeps absent optional history/PS-77 columns from preventing baseline diagnostics.
IF OBJECT_ID(N'dbo.flyway_schema_history', N'U') IS NOT NULL
    EXEC sys.sp_executesql N'
        SELECT N''flyway_history'' AS section, installed_rank, version, description, type,
               script, checksum, installed_on, execution_time, success
        FROM dbo.flyway_schema_history ORDER BY installed_rank;';
ELSE
    SELECT N'flyway_history' AS section, N'NOT_VISIBLE_OR_ABSENT; history was not validated' AS finding;

SELECT N'possible_migration_histories' AS section, SCHEMA_NAME(schema_id) AS schema_name, name
FROM sys.tables WHERE name LIKE N'%flyway%';

SELECT N'ps77_schema_inventory' AS section, s.name AS schema_name, t.name AS table_name,
       c.name AS column_name, ty.name AS sql_type, c.max_length, c.is_nullable
FROM sys.tables t JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
WHERE t.name IN (N'subscription_plans', N'owner_subscription_entitlements',
                 N'subscription_plan_versions', N'owner_subscriptions', N'subscription_change_records')
   OR (s.name = N'dbo' AND t.name = N'assets' AND c.name = N'payload_size_bytes')
ORDER BY schema_name, table_name, c.column_id;

-- No joins to versions: each asset is counted exactly once, without choosing quota eligibility.
SELECT N'assets_by_type_status' AS section, asset_type, status, COUNT_BIG(*) AS asset_rows,
       SUM(CONVERT(bigint, CASE WHEN encrypted_payload IS NOT NULL THEN 1 ELSE 0 END)) AS with_payload,
       SUM(CONVERT(decimal(38,0), COALESCE(DATALENGTH(encrypted_payload), 0))) AS ciphertext_payload_bytes,
       SUM(CONVERT(bigint, CASE
           WHEN (encrypted_payload IS NULL AND (encryption_iv IS NOT NULL OR encryption_key_version IS NOT NULL))
             OR (encrypted_payload IS NOT NULL AND (encryption_iv IS NULL OR encryption_key_version IS NULL))
           THEN 1 ELSE 0 END)) AS incomplete_encryption_metadata
FROM dbo.assets GROUP BY asset_type, status;

-- Sum ALL retained versions independently. Recorded logical bytes and ciphertext bytes are distinct.
SELECT N'retained_versions_by_status' AS section, upload_status, COUNT_BIG(*) AS version_rows,
       SUM(CONVERT(decimal(38,0), file_size_bytes)) AS recorded_file_bytes,
       MIN(file_size_bytes) AS smallest_recorded_file_bytes, MAX(file_size_bytes) AS largest_recorded_file_bytes,
       SUM(CONVERT(decimal(38,0), COALESCE(DATALENGTH(encrypted_file_content), 0))) AS ciphertext_file_bytes,
       SUM(CONVERT(bigint, CASE WHEN file_size_bytes IS NULL OR file_size_bytes <= 0 THEN 1 ELSE 0 END)) AS invalid_recorded_sizes,
       SUM(CONVERT(bigint, CASE WHEN encrypted_file_content IS NULL OR encryption_iv IS NULL
                                   OR encryption_key_version IS NULL THEN 1 ELSE 0 END)) AS incomplete_encryption_metadata
FROM dbo.asset_versions GROUP BY upload_status;

SELECT N'storage_relationship_anomalies' AS section,
       (SELECT COUNT_BIG(*) FROM dbo.assets a
        WHERE NOT EXISTS (SELECT 1 FROM dbo.vaults v WHERE v.vault_id = a.vault_id)) AS assets_without_vault,
       (SELECT COUNT_BIG(*) FROM dbo.asset_versions av
        WHERE NOT EXISTS (SELECT 1 FROM dbo.assets a WHERE a.asset_id = av.asset_id)) AS versions_without_asset;

IF COL_LENGTH(N'dbo.assets', N'payload_size_bytes') IS NOT NULL
    EXEC sys.sp_executesql N'
        SELECT N''payload_size_metadata'' AS section, asset_type, status, COUNT_BIG(*) AS asset_rows,
               SUM(CONVERT(bigint, CASE WHEN payload_size_bytes IS NULL THEN 1 ELSE 0 END)) AS unknown_size_rows,
               SUM(CONVERT(bigint, CASE WHEN payload_size_bytes < 0 THEN 1 ELSE 0 END)) AS negative_size_rows,
               SUM(CONVERT(decimal(38,0), payload_size_bytes)) AS recorded_payload_bytes
        FROM dbo.assets GROUP BY asset_type, status;';
ELSE
    SELECT N'payload_size_metadata' AS section,
           N'ABSENT; logical payload bytes unknown. Do not backfill zero or infer from ciphertext here.' AS finding;

SELECT N'policy_status' AS section,
       N'UNDECIDED: count scope, storage scope/units, backfill, periods, grant authority and legal evidence. No quota readiness claim.' AS finding;

-- A detected duplicate is a hard stop for future lifetime-Vault migration, never an automatic repair.
IF @duplicate_owners > 0
    THROW 51771, 'Duplicate Vault owners found. Stop PS-77 migration planning; investigate without automatic merge/delete.', 1;
IF @global_owner_unique = 0
    THROW 51772, 'Enabled unfiltered single-key Owner unique index is missing. Stop lifetime-Vault migration planning.', 1;
