-- PS-86: only hashes of server-generated invitation secrets are persisted.
CREATE TABLE dbo.beneficiary_invitations (
    invitation_id BIGINT IDENTITY PRIMARY KEY,
    public_id UNIQUEIDENTIFIER NOT NULL,
    beneficiary_id BIGINT NOT NULL REFERENCES dbo.beneficiaries(beneficiary_id),
    generation INT NOT NULL,
    is_current BIT NOT NULL,
    code_hash VARCHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    issued_at DATETIME2(7) NOT NULL,
    expires_at DATETIME2(7) NOT NULL,
    issued_by_user_id BIGINT NOT NULL REFERENCES dbo.users(user_id),
    revoked_at DATETIME2(7) NULL,
    revoked_by_user_id BIGINT NULL REFERENCES dbo.users(user_id),
    consumed_at DATETIME2(7) NULL,
    consumed_by_user_id BIGINT NULL REFERENCES dbo.users(user_id),
    CONSTRAINT UQ_invitation_public UNIQUE(public_id),
    CONSTRAINT UQ_invitation_hash UNIQUE(code_hash),
    CONSTRAINT UQ_invitation_generation UNIQUE(beneficiary_id, generation),
    CONSTRAINT CK_invitation_generation CHECK(generation > 0),
    CONSTRAINT CK_invitation_expiry CHECK(expires_at > issued_at),
    CONSTRAINT CK_invitation_revocation CHECK(
        (revoked_at IS NULL AND revoked_by_user_id IS NULL) OR
        (revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL AND revoked_at >= issued_at)),
    CONSTRAINT CK_invitation_consumption CHECK(
        (consumed_at IS NULL AND consumed_by_user_id IS NULL) OR
        (consumed_at IS NOT NULL AND consumed_by_user_id IS NOT NULL AND consumed_at >= issued_at)),
    CONSTRAINT CK_invitation_terminal CHECK(revoked_at IS NULL OR consumed_at IS NULL)
);
CREATE UNIQUE INDEX UX_invitation_current ON dbo.beneficiary_invitations(beneficiary_id) WHERE is_current = 1;
GO
-- Like V30, no INSERT trigger: Hibernate uses OUTPUT inserted. Service guards all writes.
CREATE TRIGGER dbo.TR_archive_guard_beneficiary_invitations ON dbo.beneficiary_invitations
AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM (
            SELECT beneficiary_id FROM inserted UNION SELECT beneficiary_id FROM deleted
        ) i JOIN dbo.beneficiaries b ON b.beneficiary_id = i.beneficiary_id
          JOIN dbo.vaults v ON v.vault_id = b.vault_id WHERE v.status = N'ARCHIVED'
    ) THROW 51300, 'Archived Vault is read-only.', 1;
END;
GO
