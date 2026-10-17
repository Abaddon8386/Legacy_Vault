/* Staff-recorded Trustee contact outcomes and explicit fallback workflow history (PS-44). */
CREATE TABLE dbo.trustee_contact_records (
    contact_record_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_trustee_contact_records PRIMARY KEY,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_trustee_contact_records_public_id DEFAULT NEWID(),
    trustee_id BIGINT NOT NULL,
    actor_user_id BIGINT NOT NULL,
    channel NVARCHAR(20) NOT NULL,
    outcome NVARCHAR(20) NOT NULL,
    fallback_status NVARCHAR(20) NOT NULL,
    note NVARCHAR(500) NULL,
    occurred_at DATETIME2 NOT NULL CONSTRAINT DF_trustee_contact_records_occurred_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_trustee_contact_records_public_id UNIQUE (public_id),
    CONSTRAINT FK_trustee_contact_records_trustee FOREIGN KEY (trustee_id) REFERENCES dbo.trustees(trustee_id),
    CONSTRAINT FK_trustee_contact_records_actor FOREIGN KEY (actor_user_id) REFERENCES dbo.users(user_id),
    CONSTRAINT CK_trustee_contact_records_channel CHECK (channel IN ('PHONE', 'EMAIL', 'IN_PERSON', 'OTHER')),
    CONSTRAINT CK_trustee_contact_records_outcome CHECK (outcome IN ('CONTACTED', 'NO_RESPONSE', 'INVALID_CONTACT')),
    CONSTRAINT CK_trustee_contact_records_fallback CHECK (fallback_status IN ('NOT_REQUIRED', 'REQUIRED', 'IN_PROGRESS', 'COMPLETED'))
);
CREATE INDEX IX_trustee_contact_records_trustee_occurred ON dbo.trustee_contact_records(trustee_id, occurred_at DESC);
