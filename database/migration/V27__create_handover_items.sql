/*
 * LegacyVault - V27 (PS-65, ST-25, LV-HANDOVER-001)
 * Purpose:
 *   - Record each approved allocation line (asset -> recipient) that Staff physically handed over at the counter.
 *   - One delivery per allocation line (unique allocation_id): a line cannot be delivered twice. A new dossier
 *     version has new allocation lines, so earlier deliveries stay as history.
 *   - status DELIVERED now; VERIFIED_BY_BENEFICIARY is reserved for the Beneficiary reconciliation step (ST-26).
 * Safety:
 *   - New table only; existing data is not touched. Rows are append-only: no DELETE, and the identity of a
 *     delivery (session, allocation, asset, recipient, Staff, time) cannot be changed.
 */
IF OBJECT_ID(N'dbo.handover_items', N'U') IS NULL
CREATE TABLE dbo.handover_items (
    handover_item_id BIGINT IDENTITY(1,1) NOT NULL,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_handover_items_public_id DEFAULT NEWID(),
    handover_session_id BIGINT NOT NULL,
    allocation_id BIGINT NOT NULL,
    asset_id BIGINT NOT NULL,
    beneficiary_id BIGINT NOT NULL,
    delivered_by_staff_user_id BIGINT NOT NULL,
    delivered_at DATETIME2 NOT NULL CONSTRAINT DF_handover_items_delivered_at DEFAULT SYSUTCDATETIME(),
    status NVARCHAR(30) NOT NULL CONSTRAINT DF_handover_items_status DEFAULT N'DELIVERED',
    CONSTRAINT PK_handover_items PRIMARY KEY (handover_item_id),
    CONSTRAINT UQ_handover_items_public_id UNIQUE (public_id),
    CONSTRAINT UQ_handover_items_allocation UNIQUE (allocation_id),
    CONSTRAINT FK_handover_items_session FOREIGN KEY (handover_session_id)
        REFERENCES dbo.handover_sessions(handover_session_id),
    CONSTRAINT FK_handover_items_allocation FOREIGN KEY (allocation_id)
        REFERENCES dbo.legal_basis_version_allocations(allocation_id),
    CONSTRAINT FK_handover_items_asset FOREIGN KEY (asset_id)
        REFERENCES dbo.assets(asset_id),
    CONSTRAINT FK_handover_items_beneficiary FOREIGN KEY (beneficiary_id)
        REFERENCES dbo.beneficiaries(beneficiary_id),
    CONSTRAINT FK_handover_items_staff FOREIGN KEY (delivered_by_staff_user_id)
        REFERENCES dbo.users(user_id),
    CONSTRAINT CK_handover_items_status CHECK (status IN (N'DELIVERED', N'VERIFIED_BY_BENEFICIARY'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_handover_items_session' AND object_id = OBJECT_ID(N'dbo.handover_items'))
    CREATE INDEX IX_handover_items_session ON dbo.handover_items(handover_session_id, delivered_at);
GO

IF OBJECT_ID(N'dbo.TR_handover_items_no_delete', N'TR') IS NULL
EXEC(N'
CREATE TRIGGER dbo.TR_handover_items_no_delete
ON dbo.handover_items
AFTER DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51271, ''Handover deliveries are historical evidence and cannot be deleted.'', 1;
END;');
GO

IF OBJECT_ID(N'dbo.TR_handover_items_immutable_identity', N'TR') IS NULL
EXEC(N'
CREATE TRIGGER dbo.TR_handover_items_immutable_identity
ON dbo.handover_items
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(handover_session_id) OR UPDATE(allocation_id) OR UPDATE(asset_id) OR UPDATE(beneficiary_id)
       OR UPDATE(delivered_by_staff_user_id) OR UPDATE(delivered_at) OR UPDATE(public_id)
        THROW 51272, ''The identity of a handover delivery cannot be changed.'', 1;
END;');
GO
