/*
 * LegacyVault - V15 (PS-43)
 * Purpose:
 *   - Keep every previous classification of a legal-basis dossier when Legal reclassifies it from ON_HOLD to NOTARIAL/COURT
 *     (LV-HOLD-001, AC-T06 style: never overwrite evidence). Append-only history; the dossier row holds the current one.
 *   - Track the Legal user of the current classification on the dossier.
 */
IF COL_LENGTH(N'dbo.legal_basis_dossiers', N'classified_by_user_id') IS NULL
    ALTER TABLE dbo.legal_basis_dossiers ADD classified_by_user_id BIGINT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_legal_basis_dossiers_classified_by')
    ALTER TABLE dbo.legal_basis_dossiers ADD CONSTRAINT FK_legal_basis_dossiers_classified_by
        FOREIGN KEY (classified_by_user_id) REFERENCES dbo.users(user_id);
GO
IF OBJECT_ID(N'dbo.legal_basis_classification_history', N'U') IS NULL
CREATE TABLE dbo.legal_basis_classification_history (
    classification_history_id BIGINT IDENTITY(1,1) NOT NULL,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_legal_basis_classification_history_public_id DEFAULT NEWID(),
    legal_basis_dossier_id BIGINT NOT NULL,
    route NVARCHAR(20) NOT NULL,
    dispute_status NVARCHAR(20) NOT NULL,
    route_reason NVARCHAR(1000) NULL,
    classified_by_user_id BIGINT NOT NULL,
    classified_at DATETIME2 NOT NULL,
    superseded_at DATETIME2 NOT NULL CONSTRAINT DF_legal_basis_classification_history_superseded_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_legal_basis_classification_history PRIMARY KEY (classification_history_id),
    CONSTRAINT UQ_legal_basis_classification_history_public_id UNIQUE (public_id),
    CONSTRAINT FK_legal_basis_classification_history_dossier FOREIGN KEY (legal_basis_dossier_id)
        REFERENCES dbo.legal_basis_dossiers(legal_basis_dossier_id),
    CONSTRAINT FK_legal_basis_classification_history_user FOREIGN KEY (classified_by_user_id)
        REFERENCES dbo.users(user_id),
    CONSTRAINT CK_legal_basis_classification_history_route CHECK (route IN (N'NOTARIAL', N'COURT', N'ON_HOLD'))
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_legal_basis_classification_history_dossier')
    CREATE INDEX IX_legal_basis_classification_history_dossier
        ON dbo.legal_basis_classification_history(legal_basis_dossier_id);
GO
