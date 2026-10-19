-- PS-67: separate immutable counter confirmations, scoped to session and approved snapshot.
CREATE TABLE dbo.beneficiary_confirmations (
 confirmation_id BIGINT IDENTITY PRIMARY KEY,
 public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_confirmations_public UNIQUE,
 handover_session_id BIGINT NOT NULL REFERENCES dbo.handover_sessions(handover_session_id),
 dossier_version_id BIGINT NOT NULL REFERENCES dbo.legal_basis_dossier_versions(dossier_version_id),
 scope_hash CHAR(64) NOT NULL,
 beneficiary_id BIGINT NOT NULL REFERENCES dbo.beneficiaries(beneficiary_id),
 confirmed_by_user_id BIGINT NOT NULL REFERENCES dbo.users(user_id),
 confirmed_at DATETIME2 NOT NULL,
 receipt_reference NVARCHAR(200) NOT NULL,
 CONSTRAINT UQ_confirmations_snapshot_recipient UNIQUE(handover_session_id,dossier_version_id,scope_hash,beneficiary_id),
 CONSTRAINT CK_confirmations_reference CHECK(LEN(LTRIM(RTRIM(receipt_reference)))>0)
);
GO
CREATE TRIGGER dbo.TR_confirmations_immutable ON dbo.beneficiary_confirmations AFTER UPDATE, DELETE AS
BEGIN
 SET NOCOUNT ON;
 THROW 51281, 'Beneficiary confirmations are immutable historical records.',1;
END;
GO
