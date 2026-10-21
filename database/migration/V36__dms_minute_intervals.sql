/* PS-91: preserve legacy rows and ALL timestamps, including archived DMS rows.
   No UPDATE/backfill: a NULL minute value means exactly legacy days * 1440.
   V34 (PS-86) and V35 (PS-80) are reserved by their existing PRs. */
ALTER TABLE dbo.dms_configs ALTER COLUMN check_interval_days SMALLINT NULL;
ALTER TABLE dbo.dms_configs ADD check_interval_minutes INT NULL;
GO
ALTER TABLE dbo.dms_configs ADD CONSTRAINT CK_dms_minute_interval CHECK (
    (check_interval_minutes IS NULL AND check_interval_days IS NOT NULL)
    OR (check_interval_minutes IS NOT NULL AND check_interval_minutes BETWEEN 1 AND 47184480
        AND ((check_interval_minutes % 1440 = 0 AND check_interval_days IS NOT NULL
              AND check_interval_days = check_interval_minutes / 1440)
             OR (check_interval_minutes % 1440 <> 0 AND check_interval_days IS NULL)))
);
