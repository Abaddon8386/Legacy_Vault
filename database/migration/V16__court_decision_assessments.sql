/* PS-47: immutable Legal assessments reference the exact immutable court-document version. */
CREATE TABLE dbo.court_decisions (
    court_decision_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_court_decisions PRIMARY KEY,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_court_decisions_public_id DEFAULT NEWID(),
    dossier_version_id BIGINT NOT NULL,
    result NVARCHAR(20) NOT NULL,
    reason NVARCHAR(1000) NOT NULL,
    reviewed_by_user_id BIGINT NOT NULL,
    reviewed_at DATETIME2 NOT NULL CONSTRAINT DF_court_decisions_reviewed_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_court_decisions_public_id UNIQUE(public_id),
    CONSTRAINT FK_court_decisions_version FOREIGN KEY(dossier_version_id) REFERENCES dbo.legal_basis_dossier_versions(dossier_version_id),
    CONSTRAINT FK_court_decisions_reviewer FOREIGN KEY(reviewed_by_user_id) REFERENCES dbo.users(user_id),
    CONSTRAINT CK_court_decisions_result CHECK(result IN (N'VALID', N'INVALID', N'INCONCLUSIVE')),
    CONSTRAINT CK_court_decisions_reason CHECK(LEN(LTRIM(RTRIM(reason))) > 0)
);
CREATE INDEX IX_court_decisions_latest ON dbo.court_decisions(dossier_version_id, reviewed_at DESC, court_decision_id DESC);
GO
CREATE TRIGGER dbo.TR_court_decisions_append_only ON dbo.court_decisions
INSTEAD OF UPDATE, DELETE AS
BEGIN
    THROW 51003, 'Court decision assessments are append-only.', 1;
END;
GO
