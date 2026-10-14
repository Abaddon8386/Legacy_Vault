/* PS-20: updated_at is required by the Beneficiary entity/API response. */
IF COL_LENGTH(N'dbo.beneficiaries', N'updated_at') IS NULL
BEGIN
    ALTER TABLE dbo.beneficiaries
        ADD updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_beneficiaries_updated_at DEFAULT SYSUTCDATETIME();
END;
