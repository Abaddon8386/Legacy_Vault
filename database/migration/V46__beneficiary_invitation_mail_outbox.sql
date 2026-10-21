CREATE TABLE dbo.beneficiary_invitation_mail_outbox (
    outbox_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_beneficiary_invitation_mail_outbox PRIMARY KEY,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_beneficiary_invitation_mail_outbox_public UNIQUE,
    beneficiary_id BIGINT NOT NULL REFERENCES dbo.beneficiaries(beneficiary_id),
    invitation_id BIGINT NOT NULL,
    invitation_public_id UNIQUEIDENTIFIER NOT NULL,
    request_generation INT NOT NULL,
    invitation_generation INT NOT NULL,
    payload_ciphertext VARBINARY(MAX) NOT NULL,
    payload_iv VARBINARY(12) NOT NULL,
    key_version VARCHAR(32) NOT NULL,
    transport_status VARCHAR(20) NOT NULL CONSTRAINT DF_beneficiary_invitation_mail_outbox_status DEFAULT 'QUEUED',
    created_at DATETIME2(7) NOT NULL CONSTRAINT DF_beneficiary_invitation_mail_outbox_created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_beneficiary_invitation_mail_outbox_invitation UNIQUE(invitation_id),
    CONSTRAINT FK_beneficiary_invitation_mail_outbox_invitation FOREIGN KEY(invitation_id)
        REFERENCES dbo.beneficiary_invitations(invitation_id),
    CONSTRAINT UQ_beneficiary_invitation_mail_outbox_request UNIQUE(beneficiary_id, request_generation),
    CONSTRAINT CK_beneficiary_invitation_mail_outbox_generation CHECK(request_generation >= 0 AND invitation_generation > 0),
    CONSTRAINT CK_beneficiary_invitation_mail_outbox_iv CHECK(DATALENGTH(payload_iv) = 12),
    CONSTRAINT CK_beneficiary_invitation_mail_outbox_status CHECK(transport_status = 'QUEUED')
);

-- Plaintext recipient/code are never persisted. No worker is enabled until delivery, retry and retention policies are approved.
