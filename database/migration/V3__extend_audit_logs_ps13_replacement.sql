/*
 * LegacyVault - PS-13 / LV-AUD-001
 * SQL Server migration: extend dbo.audit_logs for append-only audit events.
 *
 * IMPORTANT:
 * - This migration never UPDATEs or DELETEs dbo.audit_logs.
 * - Keep the V1 append-only triggers enabled.
 * - Runtime database principal must not be db_owner and must not have
 *   UPDATE/DELETE permission on dbo.audit_logs.
 * - actor_type is nullable for legacy rows. New application inserts must
 *   explicitly supply USER or SYSTEM.
 *
 * Before running:
 * - Confirm V1 and V2 are applied.
 * - Inspect flyway_schema_history and dbo.audit_logs after the previous failure.
 * - If V3 has already been applied successfully in a shared environment, do not
 *   replace its contents there; create a new migration instead.
 */

SET XACT_ABORT ON;

-- Add only columns that do not already exist. This also helps recover safely
-- if a previous failed attempt left schema changes behind.
IF COL_LENGTH(N'dbo.audit_logs', N'actor_type') IS NULL
    ALTER TABLE dbo.audit_logs ADD actor_type NVARCHAR(10) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'actor_roles') IS NULL
    ALTER TABLE dbo.audit_logs ADD actor_roles NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'state_before') IS NULL
    ALTER TABLE dbo.audit_logs ADD state_before NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'state_after') IS NULL
    ALTER TABLE dbo.audit_logs ADD state_after NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'trace_id') IS NULL
    ALTER TABLE dbo.audit_logs ADD trace_id UNIQUEIDENTIFIER NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'step_id') IS NULL
    ALTER TABLE dbo.audit_logs ADD step_id NVARCHAR(50) NULL;

IF COL_LENGTH(N'dbo.audit_logs', N'rule_id') IS NULL
    ALTER TABLE dbo.audit_logs ADD rule_id NVARCHAR(100) NULL;

-- Use dynamic SQL for constraints that reference columns introduced above.
-- This makes SQL Server compile these statements after the columns exist.
IF OBJECT_ID(N'dbo.CK_audit_logs_actor_type', N'C') IS NULL
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.audit_logs
        ADD CONSTRAINT CK_audit_logs_actor_type
        CHECK (actor_type IS NULL OR actor_type IN (N''USER'', N''SYSTEM''));
    ';

IF OBJECT_ID(N'dbo.CK_audit_logs_actor_roles_json', N'C') IS NULL
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.audit_logs
        ADD CONSTRAINT CK_audit_logs_actor_roles_json
        CHECK (actor_roles IS NULL OR ISJSON(actor_roles) = 1);
    ';

IF OBJECT_ID(N'dbo.CK_audit_logs_state_before_json', N'C') IS NULL
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.audit_logs
        ADD CONSTRAINT CK_audit_logs_state_before_json
        CHECK (state_before IS NULL OR ISJSON(state_before) = 1);
    ';

IF OBJECT_ID(N'dbo.CK_audit_logs_state_after_json', N'C') IS NULL
    EXEC sys.sp_executesql N'
        ALTER TABLE dbo.audit_logs
        ADD CONSTRAINT CK_audit_logs_state_after_json
        CHECK (state_after IS NULL OR ISJSON(state_after) = 1);
    ';

-- Default retention for future inserts only. Existing audit records are not
-- updated; retention_until should be explicitly set to at least 12 months for
-- new records if application policy requires a precise retention deadline.
IF OBJECT_ID(N'dbo.DF_audit_logs_retention_until', N'D') IS NULL
    ALTER TABLE dbo.audit_logs
    ADD CONSTRAINT DF_audit_logs_retention_until
    DEFAULT (DATEADD(MONTH, 12, SYSUTCDATETIME())) FOR retention_until;

-- Create the index in a separately compiled dynamic batch because trace_id
-- was introduced by this migration.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_audit_logs_trace_id'
      AND object_id = OBJECT_ID(N'dbo.audit_logs')
)
    EXEC sys.sp_executesql N'
        CREATE INDEX IX_audit_logs_trace_id
        ON dbo.audit_logs(trace_id)
        WHERE trace_id IS NOT NULL;
    ';

/*
 * Application implementation notes:
 * 1. AuditService must set actor_type explicitly on every new event.
 * 2. Keep filtered JSON context in the existing details column; do not duplicate it.
 * 3. Never log passwords, JWTs, encryption keys, asset payloads, file bytes,
 *    or full identity numbers.
 * 4. No public AuditController is introduced by this migration.
 */
