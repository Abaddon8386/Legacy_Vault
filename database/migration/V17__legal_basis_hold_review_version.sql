/* PS-48: a hold requires a new dossier version; previous evidence/assessments remain unchanged. */
ALTER TABLE dbo.legal_basis_dossiers ADD required_version_no INT NOT NULL
    CONSTRAINT DF_legal_basis_dossiers_required_version DEFAULT (1);
GO
ALTER TABLE dbo.legal_basis_dossiers ADD CONSTRAINT CK_legal_basis_dossiers_required_version
    CHECK (required_version_no >= 1);
GO
