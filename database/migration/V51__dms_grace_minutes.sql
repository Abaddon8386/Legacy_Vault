/* Grace precision: store the DMS grace period in minutes (days/hours/minutes).
   No UPDATE/backfill: a NULL minute value means exactly legacy grace_period_days * 1440, so existing rows
   and their deadlines are unchanged. grace_period_days stays NOT NULL and always equals floor(minutes / 1440)
   so legacy readers keep working. Upper bound is 30 days (43200 minutes) for new values. */
ALTER TABLE dbo.dms_configs ADD grace_period_minutes INT NULL;
GO
ALTER TABLE dbo.dms_configs ADD CONSTRAINT CK_dms_grace_minutes CHECK (
    grace_period_minutes IS NULL
    OR (grace_period_minutes BETWEEN 0 AND 43200
        AND grace_period_days = grace_period_minutes / 1440)
);
