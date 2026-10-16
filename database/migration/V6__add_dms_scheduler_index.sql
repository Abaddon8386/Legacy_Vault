/* Scheduler lookup index for DMS configurations due for check-in evaluation. */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.dms_configs')
      AND name = N'IX_dms_configs_status_next_check_at'
)
BEGIN
    CREATE INDEX IX_dms_configs_status_next_check_at
        ON dbo.dms_configs(status, next_check_at)
        INCLUDE (dms_id, owner_user_id);
END;
