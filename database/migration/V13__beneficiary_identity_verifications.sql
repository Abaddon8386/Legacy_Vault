/* Staff records in-person, hard-copy identity verification outcomes (PS-45). */
CREATE TABLE dbo.beneficiary_identity_verifications (
    verification_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_beneficiary_identity_verifications PRIMARY KEY,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_beneficiary_identity_verifications_public_id DEFAULT NEWID(),
    beneficiary_id BIGINT NOT NULL,
    actor_user_id BIGINT NOT NULL,
    document_type NVARCHAR(20) NOT NULL,
    issuing_authority NVARCHAR(150) NULL,
    document_suffix NVARCHAR(4) NULL,
    result NVARCHAR(20) NOT NULL,
    verified_at DATETIME2 NOT NULL CONSTRAINT DF_beneficiary_identity_verifications_verified_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_beneficiary_identity_verifications_public_id UNIQUE (public_id),
    CONSTRAINT FK_beneficiary_identity_verifications_beneficiary FOREIGN KEY (beneficiary_id) REFERENCES dbo.beneficiaries(beneficiary_id),
    CONSTRAINT FK_beneficiary_identity_verifications_actor FOREIGN KEY (actor_user_id) REFERENCES dbo.users(user_id),
    CONSTRAINT CK_beneficiary_identity_verifications_document CHECK (document_type IN ('CCCD', 'PASSPORT')),
    CONSTRAINT CK_beneficiary_identity_verifications_result CHECK (result IN ('MATCH', 'NOT_MATCH'))
);
CREATE INDEX IX_beneficiary_identity_verifications_beneficiary_verified ON dbo.beneficiary_identity_verifications(beneficiary_id, verified_at DESC);
