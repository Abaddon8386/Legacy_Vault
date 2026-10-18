
/*
 * LegacyVault - V18 (PS-37)
 * LV-BASIS-001 / LV-HOLD-001
 * Track review snapshots and re-review history independently from dossier route/status.
 */
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.legal_basis_dossiers', N'U') IS NULL
    THROW 51160, 'V18 requires dbo.legal_basis_dossiers.', 1;

IF OBJECT_ID(N'dbo.legal_basis_dossier_versions', N'U') IS NULL
    THROW 51161, 'V18 requires dbo.legal_basis_dossier_versions.', 1;

IF COL_LENGTH(N'dbo.legal_basis_dossiers', N'review_status') IS NULL
ALTER TABLE dbo.legal_basis_dossiers ADD review_status NVARCHAR(30) NOT NULL
        CONSTRAINT DF_legal_basis_dossiers_review_status DEFAULT N'REVIEW_REQUIRED';

IF COL_LENGTH(N'dbo.legal_basis_dossiers', N'review_required_reason') IS NULL
ALTER TABLE dbo.legal_basis_dossiers ADD review_required_reason NVARCHAR(1000) NULL;

IF COL_LENGTH(N'dbo.legal_basis_dossiers', N'last_reviewed_version_no') IS NULL
ALTER TABLE dbo.legal_basis_dossiers ADD last_reviewed_version_no INT NULL;

IF COL_LENGTH(N'dbo.legal_basis_dossiers', N'last_reviewed_sha256_hash') IS NULL
ALTER TABLE dbo.legal_basis_dossiers ADD last_reviewed_sha256_hash CHAR(64) NULL;

IF COL_LENGTH(N'dbo.legal_basis_dossiers', N'last_reviewed_dispute_status') IS NULL
ALTER TABLE dbo.legal_basis_dossiers ADD last_reviewed_dispute_status NVARCHAR(20) NULL;

IF COL_LENGTH(N'dbo.legal_basis_dossiers', N'last_reviewed_allocation_hash') IS NULL
ALTER TABLE dbo.legal_basis_dossiers ADD last_reviewed_allocation_hash CHAR(64) NULL;

IF OBJECT_ID(N'dbo.legal_basis_review_history', N'U') IS NULL
BEGIN
CREATE TABLE dbo.legal_basis_review_history (
                                                legal_basis_review_id BIGINT IDENTITY(1,1) NOT NULL,
                                                public_id UNIQUEIDENTIFIER NOT NULL
                                                    CONSTRAINT DF_legal_basis_review_history_public_id DEFAULT NEWID(),
                                                legal_basis_dossier_id BIGINT NOT NULL,
                                                dossier_version_id BIGINT NULL,
                                                version_no INT NULL,
                                                sha256_hash CHAR(64) NULL,
                                                dispute_status NVARCHAR(20) NULL,
                                                allocation_hash CHAR(64) NULL,
                                                review_status NVARCHAR(30) NOT NULL,
                                                reason_code NVARCHAR(50) NOT NULL,
                                                reason NVARCHAR(1000) NOT NULL,
                                                reviewed_by_user_id BIGINT NULL,
                                                reviewed_at DATETIME2 NOT NULL
                                                    CONSTRAINT DF_legal_basis_review_history_reviewed_at DEFAULT SYSUTCDATETIME(),

                                                CONSTRAINT PK_legal_basis_review_history
                                                    PRIMARY KEY (legal_basis_review_id),
                                                CONSTRAINT UQ_legal_basis_review_history_public_id
                                                    UNIQUE (public_id),
                                                CONSTRAINT FK_legal_basis_review_history_dossier
                                                    FOREIGN KEY (legal_basis_dossier_id)
                                                        REFERENCES dbo.legal_basis_dossiers(legal_basis_dossier_id),
                                                CONSTRAINT FK_legal_basis_review_history_version
                                                    FOREIGN KEY (dossier_version_id)
                                                        REFERENCES dbo.legal_basis_dossier_versions(dossier_version_id),
                                                CONSTRAINT FK_legal_basis_review_history_reviewer
                                                    FOREIGN KEY (reviewed_by_user_id)
                                                        REFERENCES dbo.users(user_id),
                                                CONSTRAINT CK_legal_basis_review_history_status
                                                    CHECK (review_status IN
                                                           (N'REVIEW_REQUIRED', N'FRESH', N'STALE', N'INDETERMINATE')),
                                                CONSTRAINT CK_legal_basis_review_history_version_no
                                                    CHECK (version_no IS NULL OR version_no >= 1)
);

CREATE INDEX IX_legal_basis_review_history_dossier_time
    ON dbo.legal_basis_review_history
        (legal_basis_dossier_id, reviewed_at DESC);

CREATE INDEX IX_legal_basis_review_history_status
    ON dbo.legal_basis_review_history
        (review_status, reviewed_at DESC);
END;
