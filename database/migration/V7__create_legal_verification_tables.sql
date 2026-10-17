/*
 * LegacyVault - V7
 * Create the 7 new tables defined in LegacyVault_PS73_Data_Dictionary_Cleaned.docx.
 * SQL Server / Flyway migration.
 *
 * IMPORTANT:
 * - This migration creates schema only; it does not drop asset_allocations.
 * - Confirm V1-V6 completed successfully and the referenced base tables/columns exist.
 */

CREATE TABLE dbo.verification_cases (
    verification_case_id BIGINT IDENTITY(1,1) NOT NULL,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_verification_cases_public_id DEFAULT NEWID(),
    vault_id BIGINT NOT NULL,
    status NVARCHAR(30) NOT NULL CONSTRAINT DF_verification_cases_status DEFAULT N'OPEN',
    triggered_at DATETIME2 NOT NULL,
    assigned_staff_user_id BIGINT NULL,
    opened_by_user_id BIGINT NULL,
    opened_at DATETIME2 NOT NULL CONSTRAINT DF_verification_cases_opened_at DEFAULT SYSUTCDATETIME(),
    closed_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_verification_cases_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_verification_cases_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_verification_cases PRIMARY KEY (verification_case_id),
    CONSTRAINT UQ_verification_cases_public_id UNIQUE (public_id),
    CONSTRAINT FK_verification_cases_vaults FOREIGN KEY (vault_id) REFERENCES dbo.vaults(vault_id),
    CONSTRAINT FK_verification_cases_assigned_staff FOREIGN KEY (assigned_staff_user_id) REFERENCES dbo.users(user_id),
    CONSTRAINT FK_verification_cases_opened_by FOREIGN KEY (opened_by_user_id) REFERENCES dbo.users(user_id)
);
CREATE INDEX IX_verification_cases_vault_status ON dbo.verification_cases(vault_id, status);
CREATE INDEX IX_verification_cases_assigned_staff ON dbo.verification_cases(assigned_staff_user_id, status);


CREATE TABLE dbo.death_document_records (
    death_document_record_id BIGINT IDENTITY(1,1) NOT NULL,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_death_document_records_public_id DEFAULT NEWID(),
    verification_case_id BIGINT NOT NULL,
    document_type NVARCHAR(40) NOT NULL,
    issuing_authority NVARCHAR(255) NULL,
    document_number NVARCHAR(100) NULL,
    issued_date DATE NULL,
    received_by_user_id BIGINT NOT NULL,
    received_at DATETIME2 NOT NULL CONSTRAINT DF_death_document_records_received_at DEFAULT SYSUTCDATETIME(),
    evidence_reference NVARCHAR(500) NULL,
    notes NVARCHAR(1000) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_death_document_records_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_death_document_records PRIMARY KEY (death_document_record_id),
    CONSTRAINT UQ_death_document_records_public_id UNIQUE (public_id),
    CONSTRAINT FK_death_document_records_case FOREIGN KEY (verification_case_id)
        REFERENCES dbo.verification_cases(verification_case_id),
    CONSTRAINT FK_death_document_records_received_by FOREIGN KEY (received_by_user_id)
        REFERENCES dbo.users(user_id)
);
CREATE INDEX IX_death_document_records_case ON dbo.death_document_records(verification_case_id);


CREATE TABLE dbo.original_will_intakes (
    original_will_intake_id BIGINT IDENTITY(1,1) NOT NULL,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_original_will_intakes_public_id DEFAULT NEWID(),
    verification_case_id BIGINT NOT NULL,
    delivered_by_name NVARCHAR(150) NOT NULL,
    delivered_by_relationship NVARCHAR(100) NULL,
    received_by_user_id BIGINT NOT NULL,
    received_at DATETIME2 NOT NULL CONSTRAINT DF_original_will_intakes_received_at DEFAULT SYSUTCDATETIME(),
    evidence_reference NVARCHAR(500) NULL,
    condition_notes NVARCHAR(1000) NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_original_will_intakes_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_original_will_intakes PRIMARY KEY (original_will_intake_id),
    CONSTRAINT UQ_original_will_intakes_public_id UNIQUE (public_id),
    CONSTRAINT FK_original_will_intakes_case FOREIGN KEY (verification_case_id)
        REFERENCES dbo.verification_cases(verification_case_id),
    CONSTRAINT FK_original_will_intakes_received_by FOREIGN KEY (received_by_user_id)
        REFERENCES dbo.users(user_id)
);
CREATE INDEX IX_original_will_intakes_case ON dbo.original_will_intakes(verification_case_id);


CREATE TABLE dbo.will_comparisons (
    will_comparison_id BIGINT IDENTITY(1,1) NOT NULL,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_will_comparisons_public_id DEFAULT NEWID(),
    verification_case_id BIGINT NOT NULL,
    original_will_intake_id BIGINT NOT NULL,
    asset_version_id BIGINT NOT NULL,
    referenced_sha256_hash CHAR(64) NOT NULL,
    comparison_result NVARCHAR(20) NOT NULL,
    checked_by_user_id BIGINT NOT NULL,
    reason NVARCHAR(1000) NULL,
    compared_at DATETIME2 NOT NULL CONSTRAINT DF_will_comparisons_compared_at DEFAULT SYSUTCDATETIME(),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_will_comparisons_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_will_comparisons PRIMARY KEY (will_comparison_id),
    CONSTRAINT UQ_will_comparisons_public_id UNIQUE (public_id),
    CONSTRAINT FK_will_comparisons_case FOREIGN KEY (verification_case_id)
        REFERENCES dbo.verification_cases(verification_case_id),
    CONSTRAINT FK_will_comparisons_original_intake FOREIGN KEY (original_will_intake_id)
        REFERENCES dbo.original_will_intakes(original_will_intake_id),
    CONSTRAINT FK_will_comparisons_asset_version FOREIGN KEY (asset_version_id)
        REFERENCES dbo.asset_versions(asset_version_id),
    CONSTRAINT FK_will_comparisons_checked_by FOREIGN KEY (checked_by_user_id)
        REFERENCES dbo.users(user_id),
    CONSTRAINT CK_will_comparisons_result CHECK (comparison_result IN (N'MATCH', N'MISMATCH', N'INCONCLUSIVE'))
);
CREATE INDEX IX_will_comparisons_case ON dbo.will_comparisons(verification_case_id);


CREATE TABLE dbo.legal_basis_dossiers (
    legal_basis_dossier_id BIGINT IDENTITY(1,1) NOT NULL,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_legal_basis_dossiers_public_id DEFAULT NEWID(),
    verification_case_id BIGINT NOT NULL,
    route NVARCHAR(20) NOT NULL,
    status NVARCHAR(30) NOT NULL CONSTRAINT DF_legal_basis_dossiers_status DEFAULT N'DRAFT',
    route_reason NVARCHAR(1000) NULL,
    dispute_status NVARCHAR(20) NOT NULL CONSTRAINT DF_legal_basis_dossiers_dispute_status DEFAULT N'NONE',
    created_by_user_id BIGINT NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_legal_basis_dossiers_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_legal_basis_dossiers_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_legal_basis_dossiers PRIMARY KEY (legal_basis_dossier_id),
    CONSTRAINT UQ_legal_basis_dossiers_public_id UNIQUE (public_id),
    CONSTRAINT FK_legal_basis_dossiers_case FOREIGN KEY (verification_case_id)
        REFERENCES dbo.verification_cases(verification_case_id),
    CONSTRAINT FK_legal_basis_dossiers_created_by FOREIGN KEY (created_by_user_id)
        REFERENCES dbo.users(user_id),
    CONSTRAINT CK_legal_basis_dossiers_route CHECK (route IN (N'NOTARIAL', N'COURT', N'ON_HOLD'))
);
CREATE INDEX IX_legal_basis_dossiers_case ON dbo.legal_basis_dossiers(verification_case_id, status);


CREATE TABLE dbo.legal_basis_dossier_versions (
    dossier_version_id BIGINT IDENTITY(1,1) NOT NULL,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_legal_basis_dossier_versions_public_id DEFAULT NEWID(),
    legal_basis_dossier_id BIGINT NOT NULL,
    version_no INT NOT NULL,
    file_reference NVARCHAR(500) NOT NULL,
    sha256_hash CHAR(64) NOT NULL,
    version_notes NVARCHAR(1000) NULL,
    created_by_user_id BIGINT NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_legal_basis_dossier_versions_created_at DEFAULT SYSUTCDATETIME(),
    forwarded_by_user_id BIGINT NULL,
    forwarded_at DATETIME2 NULL,
    forward_status NVARCHAR(20) NOT NULL CONSTRAINT DF_legal_basis_dossier_versions_forward_status DEFAULT N'NOT_FORWARDED',
    CONSTRAINT PK_legal_basis_dossier_versions PRIMARY KEY (dossier_version_id),
    CONSTRAINT UQ_legal_basis_dossier_versions_public_id UNIQUE (public_id),
    CONSTRAINT UQ_legal_basis_dossier_versions_dossier_version UNIQUE (legal_basis_dossier_id, version_no),
    CONSTRAINT FK_legal_basis_dossier_versions_dossier FOREIGN KEY (legal_basis_dossier_id)
        REFERENCES dbo.legal_basis_dossiers(legal_basis_dossier_id),
    CONSTRAINT FK_legal_basis_dossier_versions_created_by FOREIGN KEY (created_by_user_id)
        REFERENCES dbo.users(user_id),
    CONSTRAINT FK_legal_basis_dossier_versions_forwarded_by FOREIGN KEY (forwarded_by_user_id)
        REFERENCES dbo.users(user_id),
    CONSTRAINT CK_legal_basis_dossier_versions_version_no CHECK (version_no >= 1)
);
CREATE INDEX IX_legal_basis_dossier_versions_dossier ON dbo.legal_basis_dossier_versions(legal_basis_dossier_id);


CREATE TABLE dbo.legal_basis_version_allocations (
    allocation_id BIGINT IDENTITY(1,1) NOT NULL,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_legal_basis_version_allocations_public_id DEFAULT NEWID(),
    dossier_version_id BIGINT NOT NULL,
    asset_id BIGINT NOT NULL,
    beneficiary_id BIGINT NOT NULL,
    allocation_description NVARCHAR(MAX) NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_legal_basis_version_allocations_status DEFAULT N'DRAFT',
    created_at DATETIME2 NOT NULL CONSTRAINT DF_legal_basis_version_allocations_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_legal_basis_version_allocations PRIMARY KEY (allocation_id),
    CONSTRAINT UQ_legal_basis_version_allocations_public_id UNIQUE (public_id),
    CONSTRAINT FK_legal_basis_version_allocations_dossier_version FOREIGN KEY (dossier_version_id)
        REFERENCES dbo.legal_basis_dossier_versions(dossier_version_id),
    CONSTRAINT FK_legal_basis_version_allocations_asset FOREIGN KEY (asset_id)
        REFERENCES dbo.assets(asset_id),
    CONSTRAINT FK_legal_basis_version_allocations_beneficiary FOREIGN KEY (beneficiary_id)
        REFERENCES dbo.beneficiaries(beneficiary_id),
);
CREATE INDEX IX_legal_basis_version_allocations_dossier_version
    ON dbo.legal_basis_version_allocations(dossier_version_id);
CREATE INDEX IX_legal_basis_version_allocations_asset_beneficiary
    ON dbo.legal_basis_version_allocations(asset_id, beneficiary_id);
