
-- V1__create_initial_schema.sql
-- LegacyVault - Microsoft SQL Server
-- Initial schema aligned with PS-9..PS-23 and current PS-73 scope.
-- Apply only to a new database. Never edit this migration after it has been applied to a shared database.

CREATE TABLE dbo.users (
    user_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_users PRIMARY KEY,
    full_name NVARCHAR(150) NOT NULL,
    email NVARCHAR(254) NOT NULL,
    phone_number NVARCHAR(20) NULL,
    password_hash NVARCHAR(255) NOT NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_users_status DEFAULT 'PENDING',
    email_verified_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_users_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_users_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_users_email UNIQUE (email)
);

CREATE TABLE dbo.roles (
    role_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_roles PRIMARY KEY,
    role_code NVARCHAR(50) NOT NULL,
    role_name NVARCHAR(100) NOT NULL,
    description NVARCHAR(255) NULL,
    CONSTRAINT UQ_roles_role_code UNIQUE (role_code)
);

CREATE TABLE dbo.user_roles (
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    assigned_by_user_id BIGINT NULL,
    assigned_at DATETIME2 NOT NULL CONSTRAINT DF_user_roles_assigned_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_user_roles PRIMARY KEY (user_id, role_id),
    CONSTRAINT FK_user_roles_user FOREIGN KEY (user_id) REFERENCES dbo.users(user_id),
    CONSTRAINT FK_user_roles_role FOREIGN KEY (role_id) REFERENCES dbo.roles(role_id),
    CONSTRAINT FK_user_roles_assigned_by FOREIGN KEY (assigned_by_user_id) REFERENCES dbo.users(user_id)
);
CREATE INDEX IX_user_roles_role_id ON dbo.user_roles(role_id);

CREATE TABLE dbo.vaults (
    vault_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_vaults PRIMARY KEY,
    owner_user_id BIGINT NOT NULL,
    vault_name NVARCHAR(150) NOT NULL,
    description NVARCHAR(MAX) NULL,
    status NVARCHAR(40) NOT NULL CONSTRAINT DF_vaults_status DEFAULT 'ACTIVE',
    created_at DATETIME2 NOT NULL CONSTRAINT DF_vaults_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_vaults_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_vaults_owner UNIQUE (owner_user_id),
    CONSTRAINT FK_vaults_owner FOREIGN KEY (owner_user_id) REFERENCES dbo.users(user_id)
);

CREATE TABLE dbo.assets (
    asset_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_assets PRIMARY KEY,
    vault_id BIGINT NOT NULL,
    asset_type NVARCHAR(40) NOT NULL,
    title NVARCHAR(200) NOT NULL,
    description NVARCHAR(MAX) NULL,
    -- Nullable for versioned documents whose encrypted file bytes live in asset_versions.
    -- For non-versioned assets, service validation must require encrypted_payload, IV and key version.
    encrypted_payload VARBINARY(MAX) NULL,
    encryption_iv BINARY(12) NULL,
    encryption_key_version NVARCHAR(50) NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_assets_status DEFAULT 'ACTIVE',
    created_at DATETIME2 NOT NULL CONSTRAINT DF_assets_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_assets_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_assets_vault FOREIGN KEY (vault_id) REFERENCES dbo.vaults(vault_id),
    CONSTRAINT CK_assets_encryption_fields CHECK (
        (encrypted_payload IS NULL AND encryption_iv IS NULL AND encryption_key_version IS NULL)
        OR
        (encrypted_payload IS NOT NULL AND encryption_iv IS NOT NULL AND encryption_key_version IS NOT NULL)
    )
);
CREATE INDEX IX_assets_vault_id ON dbo.assets(vault_id);

-- PS-17/PS-18: one logical Asset can have multiple uploaded document versions.
-- Hash is integrity metadata only; it does not prove legal validity.
CREATE TABLE dbo.asset_versions (
    asset_version_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_asset_versions PRIMARY KEY,
    asset_id BIGINT NOT NULL,
    version_no INT NOT NULL,
    original_file_name NVARCHAR(255) NOT NULL,
    content_type NVARCHAR(150) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    sha256_hash CHAR(64) NOT NULL,
    encrypted_file_content VARBINARY(MAX) NOT NULL,
    encryption_iv BINARY(12) NOT NULL,
    encryption_key_version NVARCHAR(50) NOT NULL,
    upload_status NVARCHAR(20) NOT NULL CONSTRAINT DF_asset_versions_status DEFAULT 'UPLOADED',
    uploaded_by_user_id BIGINT NOT NULL,
    uploaded_at DATETIME2 NOT NULL CONSTRAINT DF_asset_versions_uploaded_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_asset_versions_asset FOREIGN KEY (asset_id) REFERENCES dbo.assets(asset_id),
    CONSTRAINT FK_asset_versions_uploaded_by FOREIGN KEY (uploaded_by_user_id) REFERENCES dbo.users(user_id),
    CONSTRAINT UQ_asset_versions_asset_version UNIQUE (asset_id, version_no),
    CONSTRAINT CK_asset_versions_version_no CHECK (version_no >= 1),
    CONSTRAINT CK_asset_versions_file_size CHECK (file_size_bytes > 0),
    CONSTRAINT CK_asset_versions_sha256 CHECK (LEN(sha256_hash) = 64)
);
CREATE INDEX IX_asset_versions_asset_id ON dbo.asset_versions(asset_id);

CREATE TABLE dbo.trustees (
    trustee_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_trustees PRIMARY KEY,
    vault_id BIGINT NOT NULL,
    full_name NVARCHAR(150) NOT NULL,
    phone_number NVARCHAR(20) NOT NULL,
    email NVARCHAR(254) NULL,
    relationship_to_owner NVARCHAR(100) NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_trustees_status DEFAULT 'APPOINTED',
    appointed_at DATETIME2 NOT NULL CONSTRAINT DF_trustees_appointed_at DEFAULT SYSUTCDATETIME(),
    revoked_at DATETIME2 NULL,
    CONSTRAINT UQ_trustees_vault UNIQUE (vault_id),
    CONSTRAINT FK_trustees_vault FOREIGN KEY (vault_id) REFERENCES dbo.vaults(vault_id)
);

CREATE TABLE dbo.beneficiaries (
    beneficiary_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_beneficiaries PRIMARY KEY,
    vault_id BIGINT NOT NULL,
    linked_user_id BIGINT NULL,
    full_name NVARCHAR(150) NOT NULL,
    email NVARCHAR(254) NULL,
    phone_number NVARCHAR(20) NULL,
    identity_document_type NVARCHAR(30) NULL,
    identity_document_no_encrypted VARBINARY(512) NULL,
    designation_status NVARCHAR(20) NOT NULL CONSTRAINT DF_beneficiaries_designation_status DEFAULT 'DESIGNATED',
    id_verification_status NVARCHAR(30) NOT NULL CONSTRAINT DF_beneficiaries_verification_status DEFAULT 'NOT_VERIFIED',
    account_status NVARCHAR(30) NOT NULL CONSTRAINT DF_beneficiaries_account_status DEFAULT 'NOT_CREATED',
    created_at DATETIME2 NOT NULL CONSTRAINT DF_beneficiaries_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_beneficiaries_vault FOREIGN KEY (vault_id) REFERENCES dbo.vaults(vault_id),
    CONSTRAINT FK_beneficiaries_user FOREIGN KEY (linked_user_id) REFERENCES dbo.users(user_id)
);
CREATE INDEX IX_beneficiaries_vault_id ON dbo.beneficiaries(vault_id);
CREATE INDEX IX_beneficiaries_linked_user_id ON dbo.beneficiaries(linked_user_id);

CREATE TABLE dbo.asset_allocations (
    allocation_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_asset_allocations PRIMARY KEY,
    asset_id BIGINT NOT NULL,
    beneficiary_id BIGINT NOT NULL,
    allocation_description NVARCHAR(MAX) NULL,
    version_no INT NOT NULL CONSTRAINT DF_asset_allocations_version_no DEFAULT 1,
    status NVARCHAR(20) NOT NULL CONSTRAINT DF_asset_allocations_status DEFAULT 'DRAFT',
    created_at DATETIME2 NOT NULL CONSTRAINT DF_asset_allocations_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_asset_allocations_asset FOREIGN KEY (asset_id) REFERENCES dbo.assets(asset_id),
    CONSTRAINT FK_asset_allocations_beneficiary FOREIGN KEY (beneficiary_id) REFERENCES dbo.beneficiaries(beneficiary_id),
    CONSTRAINT CK_asset_allocations_version CHECK (version_no >= 1)
);
CREATE INDEX IX_asset_allocations_asset_id ON dbo.asset_allocations(asset_id);
CREATE INDEX IX_asset_allocations_beneficiary_id ON dbo.asset_allocations(beneficiary_id);

-- DMS belongs to the Owner account, not to a Vault.
CREATE TABLE dbo.dms_configs (
    dms_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_dms_configs PRIMARY KEY,
    owner_user_id BIGINT NOT NULL,
    check_interval_days SMALLINT NOT NULL,
    grace_period_days SMALLINT NOT NULL,
    status NVARCHAR(30) NOT NULL CONSTRAINT DF_dms_configs_status DEFAULT 'MONITORING',
    last_check_in_at DATETIME2 NULL,
    next_check_at DATETIME2 NULL,
    triggered_at DATETIME2 NULL,
    grace_period_ends_at DATETIME2 NULL,
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_dms_configs_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_dms_configs_owner UNIQUE (owner_user_id),
    CONSTRAINT FK_dms_configs_owner FOREIGN KEY (owner_user_id) REFERENCES dbo.users(user_id),
    CONSTRAINT CK_dms_check_interval CHECK (check_interval_days > 0),
    CONSTRAINT CK_dms_grace_period CHECK (grace_period_days >= 0),
    CONSTRAINT CK_dms_trigger_grace_pair CHECK (
        (triggered_at IS NULL AND grace_period_ends_at IS NULL)
        OR (triggered_at IS NOT NULL AND grace_period_ends_at IS NOT NULL)
    )
);

CREATE TABLE dbo.vitality_check_logs (
    check_log_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_vitality_check_logs PRIMARY KEY,
    dms_id BIGINT NOT NULL,
    event_type NVARCHAR(30) NOT NULL,
    event_at DATETIME2 NOT NULL CONSTRAINT DF_vitality_check_logs_event_at DEFAULT SYSUTCDATETIME(),
    channel NVARCHAR(30) NULL,
    details NVARCHAR(MAX) NULL,
    CONSTRAINT FK_vitality_check_logs_dms FOREIGN KEY (dms_id) REFERENCES dbo.dms_configs(dms_id)
);
CREATE INDEX IX_vitality_check_logs_dms_event_at ON dbo.vitality_check_logs(dms_id, event_at);

CREATE TABLE dbo.audit_logs (
    audit_log_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_audit_logs PRIMARY KEY,
    actor_user_id BIGINT NULL,
    vault_id BIGINT NULL,
    action NVARCHAR(100) NOT NULL,
    entity_type NVARCHAR(50) NOT NULL,
    entity_id BIGINT NULL,
    occurred_at DATETIME2 NOT NULL CONSTRAINT DF_audit_logs_occurred_at DEFAULT SYSUTCDATETIME(),
    ip_address VARCHAR(45) NULL,
    details NVARCHAR(MAX) NULL,
    retention_until DATETIME2 NULL,
    CONSTRAINT FK_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES dbo.users(user_id),
    CONSTRAINT FK_audit_logs_vault FOREIGN KEY (vault_id) REFERENCES dbo.vaults(vault_id),
    CONSTRAINT CK_audit_logs_details_json CHECK (details IS NULL OR ISJSON(details) = 1)
);
CREATE INDEX IX_audit_logs_vault_occurred_at ON dbo.audit_logs(vault_id, occurred_at);
CREATE INDEX IX_audit_logs_actor_occurred_at ON dbo.audit_logs(actor_user_id, occurred_at);

-- PS-17: legal document business metadata is separate from the generic Asset/file.
CREATE TABLE dbo.legal_documents (
    legal_document_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_legal_documents PRIMARY KEY,
    asset_id BIGINT NOT NULL,
    document_type NVARCHAR(40) NOT NULL,
    verification_status NVARCHAR(30) NOT NULL CONSTRAINT DF_legal_documents_verification_status DEFAULT 'PENDING_VERIFICATION',
    submitted_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_legal_documents_created_at DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_legal_documents_updated_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_legal_documents_asset UNIQUE (asset_id),
    CONSTRAINT FK_legal_documents_asset FOREIGN KEY (asset_id) REFERENCES dbo.assets(asset_id),
    CONSTRAINT CK_legal_documents_verification_status CHECK (verification_status IN ('PENDING_VERIFICATION', 'IN_REVIEW', 'LEGAL_APPROVED', 'LEGAL_REJECTED', 'NEEDS_CORRECTION'))
);
CREATE INDEX IX_legal_documents_status ON dbo.legal_documents(verification_status);

-- Each verification attempt/decision is retained as history; do not overwrite previous decisions.
CREATE TABLE dbo.legal_verifications (
    verification_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_legal_verifications PRIMARY KEY,
    legal_document_id BIGINT NOT NULL,
    asset_version_id BIGINT NULL,
    verifier_user_id BIGINT NULL,
    result NVARCHAR(30) NOT NULL CONSTRAINT DF_legal_verifications_result DEFAULT 'PENDING',
    remarks NVARCHAR(1000) NULL,
    requested_at DATETIME2 NOT NULL CONSTRAINT DF_legal_verifications_requested_at DEFAULT SYSUTCDATETIME(),
    decided_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_legal_verifications_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_legal_verifications_document FOREIGN KEY (legal_document_id) REFERENCES dbo.legal_documents(legal_document_id),
    CONSTRAINT FK_legal_verifications_asset_version FOREIGN KEY (asset_version_id) REFERENCES dbo.asset_versions(asset_version_id),
    CONSTRAINT FK_legal_verifications_verifier FOREIGN KEY (verifier_user_id) REFERENCES dbo.users(user_id),
    CONSTRAINT CK_legal_verifications_result CHECK (result IN ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_CORRECTION')),
    CONSTRAINT CK_legal_verifications_decision_time CHECK ((result = 'PENDING' AND decided_at IS NULL) OR (result <> 'PENDING' AND decided_at IS NOT NULL))
);
CREATE INDEX IX_legal_verifications_document_requested ON dbo.legal_verifications(legal_document_id, requested_at);
CREATE INDEX IX_legal_verifications_verifier_decided ON dbo.legal_verifications(verifier_user_id, decided_at);

-- PS-13: application DB principal should have INSERT/SELECT but not UPDATE/DELETE on audit_logs.
-- Do not grant broad db_owner rights to the runtime application account.
GO

CREATE TRIGGER dbo.TR_audit_logs_no_update
ON dbo.audit_logs
INSTEAD OF UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51001, 'audit_logs is append-only; UPDATE is not allowed.', 1;
END;
GO

CREATE TRIGGER dbo.TR_audit_logs_no_delete
ON dbo.audit_logs
INSTEAD OF DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51002, 'audit_logs is append-only; DELETE is not allowed.', 1;
END;
GO

-- Seed the five agreed business roles. These statements are idempotent.
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_code = 'ROLE_VAULT_OWNER')
    INSERT INTO dbo.roles (role_code, role_name) VALUES ('ROLE_VAULT_OWNER', N'Vault Owner');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_code = 'ROLE_STAFF_EXECUTOR')
    INSERT INTO dbo.roles (role_code, role_name) VALUES ('ROLE_STAFF_EXECUTOR', N'Staff Executor');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_code = 'ROLE_LEGAL_VERIFIER')
    INSERT INTO dbo.roles (role_code, role_name) VALUES ('ROLE_LEGAL_VERIFIER', N'Legal Verifier');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_code = 'ROLE_ADMIN')
    INSERT INTO dbo.roles (role_code, role_name) VALUES ('ROLE_ADMIN', N'Administrator');
IF NOT EXISTS (SELECT 1 FROM dbo.roles WHERE role_code = 'ROLE_BENEFICIARY')
    INSERT INTO dbo.roles (role_code, role_name) VALUES ('ROLE_BENEFICIARY', N'Beneficiary');
