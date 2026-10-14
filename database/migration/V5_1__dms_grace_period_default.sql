/* PS-22: align the database default with the configurable DMS grace policy. */
IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID(N'dbo.dms_configs')
      AND c.name = N'grace_period_days'
)
BEGIN
    ALTER TABLE dbo.dms_configs
        ADD CONSTRAINT DF_dms_configs_grace_period_days DEFAULT (1) FOR grace_period_days;
END;
