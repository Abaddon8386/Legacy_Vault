/* BE-02 (ST-18, LV-BASIS-001, D-LEGAL-002): a recipient named only by a court document is stored as a Beneficiary row
   that remembers where it came from. Additive only. V50 follows V49 (PS-113); register the number before merging.
   Existing rows keep OWNER_DESIGNATED, so no data is rewritten. */
ALTER TABLE dbo.beneficiaries ADD origin NVARCHAR(30) NOT NULL
    CONSTRAINT DF_beneficiaries_origin DEFAULT N'OWNER_DESIGNATED'
    CONSTRAINT CK_beneficiaries_origin_value CHECK (origin IN (N'OWNER_DESIGNATED', N'COURT_DOCUMENT'));
ALTER TABLE dbo.beneficiaries ADD origin_dossier_version_id BIGINT NULL
    CONSTRAINT FK_beneficiaries_origin_version REFERENCES dbo.legal_basis_dossier_versions(dossier_version_id);

/* The pair must agree: a court recipient points at the exact version that named it, an owner recipient points at none. */
EXEC sys.sp_executesql N'ALTER TABLE dbo.beneficiaries ADD CONSTRAINT CK_beneficiaries_origin_version CHECK (
    (origin = N''OWNER_DESIGNATED'' AND origin_dossier_version_id IS NULL)
    OR (origin = N''COURT_DOCUMENT'' AND origin_dossier_version_id IS NOT NULL))';
EXEC sys.sp_executesql N'CREATE INDEX IX_beneficiaries_origin_version ON dbo.beneficiaries(origin_dossier_version_id)
    WHERE origin_dossier_version_id IS NOT NULL';
