-- PS-71: immutable proof of successful dual-gate close, not a terminal-status flag alone.
CREATE TABLE dbo.handover_completion_evidence(
 evidence_id BIGINT IDENTITY PRIMARY KEY,
 handover_session_id BIGINT NOT NULL UNIQUE REFERENCES dbo.handover_sessions(handover_session_id),
 dossier_version_id BIGINT NOT NULL REFERENCES dbo.legal_basis_dossier_versions(dossier_version_id),
 sha256_hash CHAR(64) NOT NULL,
 scope_hash CHAR(64) NOT NULL,
 asset_count INT NOT NULL CHECK(asset_count>0),
 beneficiary_count INT NOT NULL CHECK(beneficiary_count>0),
 completed_by_user_id BIGINT NOT NULL REFERENCES dbo.users(user_id),
 completed_at DATETIME2 NOT NULL
);
GO
CREATE TRIGGER dbo.TR_completion_evidence_immutable ON dbo.handover_completion_evidence AFTER UPDATE,DELETE AS
BEGIN
 SET NOCOUNT ON;
 THROW 51291,'Completion evidence is immutable.',1;
END;
GO
