/* PS-19: add fields required by Trustee management without editing published V1/V2. */
IF COL_LENGTH(N'dbo.trustees', N'updated_at') IS NULL
BEGIN
    ALTER TABLE dbo.trustees
        ADD updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_trustees_updated_at DEFAULT SYSUTCDATETIME();
END;

IF COL_LENGTH(N'dbo.trustees', N'note') IS NULL
BEGIN
    ALTER TABLE dbo.trustees ADD note NVARCHAR(500) NULL;
END
ELSE
BEGIN
    /* V2 created note as NVARCHAR(255); the PS-74/API contract allows 500 chars. */
    ALTER TABLE dbo.trustees ALTER COLUMN note NVARCHAR(500) NULL;
END;
