/* PS-61: append-only Staff-confirmed handover receipts and allocation snapshots. */
CREATE TABLE dbo.handover_receipts (
    handover_receipt_id BIGINT IDENTITY(1,1) NOT NULL,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_handover_receipts_public_id DEFAULT NEWID(),
    handover_session_id BIGINT NOT NULL,
    beneficiary_id BIGINT NOT NULL,
    staff_user_id BIGINT NOT NULL,
    dossier_version_id BIGINT NOT NULL,
    dossier_version_no INT NOT NULL,
    sha256_hash CHAR(64) NOT NULL,
    allocation_hash CHAR(64) NOT NULL,
    confirmation_type NVARCHAR(30) NOT NULL CONSTRAINT DF_handover_receipts_confirmation_type DEFAULT N'STAFF_ATTESTATION',
    confirmed_at DATETIME2 NOT NULL CONSTRAINT DF_handover_receipts_confirmed_at DEFAULT SYSUTCDATETIME(),
    supersedes_receipt_id BIGINT NULL,
    CONSTRAINT PK_handover_receipts PRIMARY KEY (handover_receipt_id),
    CONSTRAINT UQ_handover_receipts_public_id UNIQUE (public_id),
    CONSTRAINT FK_handover_receipts_session FOREIGN KEY (handover_session_id)
        REFERENCES dbo.handover_sessions(handover_session_id),
    CONSTRAINT FK_handover_receipts_beneficiary FOREIGN KEY (beneficiary_id)
        REFERENCES dbo.beneficiaries(beneficiary_id),
    CONSTRAINT FK_handover_receipts_staff FOREIGN KEY (staff_user_id)
        REFERENCES dbo.users(user_id),
    CONSTRAINT FK_handover_receipts_version FOREIGN KEY (dossier_version_id)
        REFERENCES dbo.legal_basis_dossier_versions(dossier_version_id),
    CONSTRAINT FK_handover_receipts_supersedes FOREIGN KEY (supersedes_receipt_id)
        REFERENCES dbo.handover_receipts(handover_receipt_id),
    CONSTRAINT CK_handover_receipts_confirmation_type CHECK (confirmation_type = N'STAFF_ATTESTATION'),
    CONSTRAINT CK_handover_receipts_version_no CHECK (dossier_version_no >= 1),
    CONSTRAINT CK_handover_receipts_not_self_superseding CHECK
        (supersedes_receipt_id IS NULL OR supersedes_receipt_id <> handover_receipt_id)
);

CREATE INDEX IX_handover_receipts_session_confirmed
    ON dbo.handover_receipts(handover_session_id, confirmed_at DESC);
CREATE UNIQUE INDEX UX_handover_receipts_single_replacement
    ON dbo.handover_receipts(supersedes_receipt_id)
    WHERE supersedes_receipt_id IS NOT NULL;

CREATE TABLE dbo.handover_receipt_assets (
    handover_receipt_asset_id BIGINT IDENTITY(1,1) NOT NULL,
    handover_receipt_id BIGINT NOT NULL,
    allocation_id BIGINT NOT NULL,
    asset_id BIGINT NOT NULL,
    CONSTRAINT PK_handover_receipt_assets PRIMARY KEY (handover_receipt_asset_id),
    CONSTRAINT UQ_handover_receipt_assets_receipt_allocation UNIQUE (handover_receipt_id, allocation_id),
    CONSTRAINT FK_handover_receipt_assets_receipt FOREIGN KEY (handover_receipt_id)
        REFERENCES dbo.handover_receipts(handover_receipt_id),
    CONSTRAINT FK_handover_receipt_assets_allocation FOREIGN KEY (allocation_id)
        REFERENCES dbo.legal_basis_version_allocations(allocation_id),
    CONSTRAINT FK_handover_receipt_assets_asset FOREIGN KEY (asset_id)
        REFERENCES dbo.assets(asset_id)
);

CREATE INDEX IX_handover_receipt_assets_receipt ON dbo.handover_receipt_assets(handover_receipt_id);

/* Receipts and their asset snapshots are historical evidence; updates/deletes are forbidden. */
CREATE TRIGGER dbo.TR_handover_receipts_immutable
ON dbo.handover_receipts
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51061, 'Handover receipts are immutable.', 1;
END;
GO

CREATE TRIGGER dbo.TR_handover_receipt_assets_immutable
ON dbo.handover_receipt_assets
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51062, 'Handover receipt asset snapshots are immutable.', 1;
END;
