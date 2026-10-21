CREATE TABLE dbo.beneficiary_counter_attestations (
    attestation_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_beneficiary_counter_attestations PRIMARY KEY,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_beneficiary_counter_attestations_public_id DEFAULT NEWID(),
    verification_case_id BIGINT NOT NULL,
    beneficiary_id BIGINT NOT NULL,
    staff_user_id BIGINT NOT NULL,
    evidence_reference NVARCHAR(200) NOT NULL,
    attested_at DATETIME2(7) NOT NULL CONSTRAINT DF_beneficiary_counter_attestations_attested_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_beneficiary_counter_attestations_public_id UNIQUE(public_id),
    CONSTRAINT FK_beneficiary_counter_attestations_case FOREIGN KEY(verification_case_id) REFERENCES dbo.verification_cases(verification_case_id),
    CONSTRAINT FK_beneficiary_counter_attestations_beneficiary FOREIGN KEY(beneficiary_id) REFERENCES dbo.beneficiaries(beneficiary_id),
    CONSTRAINT FK_beneficiary_counter_attestations_staff FOREIGN KEY(staff_user_id) REFERENCES dbo.users(user_id),
    CONSTRAINT CK_beneficiary_counter_attestations_reference CHECK(LEN(LTRIM(RTRIM(evidence_reference))) > 0)
);
CREATE INDEX IX_beneficiary_counter_attestations_case_beneficiary
    ON dbo.beneficiary_counter_attestations(verification_case_id, beneficiary_id, attested_at DESC);
GO
CREATE TRIGGER dbo.TR_beneficiary_counter_attestations_immutable ON dbo.beneficiary_counter_attestations
AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted) OR EXISTS (SELECT 1 FROM deleted)
        THROW 51310, 'Counter attestations are immutable.', 1;
END;
GO
