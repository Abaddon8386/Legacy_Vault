/*
 * LegacyVault - V10
 * Purpose:
 *   Add legal document issuer/number/date, evidence metadata, and notarization
 *   details to legal_basis_dossier_versions.
 *
 * Notes:
 *   - This migration assumes the V7 table legal_basis_dossier_versions exists.
 *   - Columns are nullable to avoid breaking existing dossier versions.
 *   - evidence_metadata stores JSON text; the CHECK constraint validates JSON
 *     only when the value is not NULL.
 *   - This migration does not store file bytes or secret data.
 */

IF OBJECT_ID(N'dbo.legal_basis_dossier_versions', N'U') IS NULL
BEGIN
    THROW 51010, 'V10 requires dbo.legal_basis_dossier_versions from V7.', 1;
END;
GO

IF COL_LENGTH(N'dbo.legal_basis_dossier_versions', N'issuing_authority') IS NULL
BEGIN
    ALTER TABLE dbo.legal_basis_dossier_versions
        ADD issuing_authority NVARCHAR(255) NULL;
END;
GO

IF COL_LENGTH(N'dbo.legal_basis_dossier_versions', N'document_number') IS NULL
BEGIN
    ALTER TABLE dbo.legal_basis_dossier_versions
        ADD document_number NVARCHAR(100) NULL;
END;
GO

IF COL_LENGTH(N'dbo.legal_basis_dossier_versions', N'issue_date') IS NULL
BEGIN
    ALTER TABLE dbo.legal_basis_dossier_versions
        ADD issue_date DATE NULL;
END;
GO

IF COL_LENGTH(N'dbo.legal_basis_dossier_versions', N'evidence_metadata') IS NULL
BEGIN
    ALTER TABLE dbo.legal_basis_dossier_versions
        ADD evidence_metadata NVARCHAR(MAX) NULL;
END;
GO

IF COL_LENGTH(N'dbo.legal_basis_dossier_versions', N'notary_authority') IS NULL
BEGIN
    ALTER TABLE dbo.legal_basis_dossier_versions
        ADD notary_authority NVARCHAR(255) NULL;
END;
GO

IF COL_LENGTH(N'dbo.legal_basis_dossier_versions', N'notarial_document_number') IS NULL
BEGIN
    ALTER TABLE dbo.legal_basis_dossier_versions
        ADD notarial_document_number NVARCHAR(100) NULL;
END;
GO

IF COL_LENGTH(N'dbo.legal_basis_dossier_versions', N'notarized_at') IS NULL
BEGIN
    ALTER TABLE dbo.legal_basis_dossier_versions
        ADD notarized_at DATE NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_legal_basis_dossier_versions_evidence_metadata_json'
      AND parent_object_id = OBJECT_ID(N'dbo.legal_basis_dossier_versions')
)
BEGIN
    ALTER TABLE dbo.legal_basis_dossier_versions
        ADD CONSTRAINT CK_legal_basis_dossier_versions_evidence_metadata_json
        CHECK (evidence_metadata IS NULL OR ISJSON(evidence_metadata) = 1);
END;
GO
