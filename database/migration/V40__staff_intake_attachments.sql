/*
 * LegacyVault - V40 (PS-103)
 * Purpose:
 *   - Append-only encrypted file/image attachments for physical documents Staff received: death documents (ST-11) and the
 *     original paper will (ST-13). One row per file; a record may have several (multi-page scans).
 *   - Ciphertext is AES-256-GCM (AAD = attachment public id) like will files and legal-basis versions; sha256_hash is of the
 *     original bytes. No identity-document groups (CCCD/passport are verified in person outside the system).
 * Notes:
 *   - V39 is reserved by the PS-106 branch (counter attestations). If that branch merges AFTER this migration is applied,
 *     Flyway would reject V39 as out of order: merge PS-106 first or renumber one of them before merging.
 *   - Only an AFTER UPDATE, DELETE trigger (no INSERT trigger) so Hibernate IDENTITY inserts with OUTPUT keep working.
 */
CREATE TABLE dbo.staff_intake_attachments (
    attachment_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_staff_intake_attachments PRIMARY KEY,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_staff_intake_attachments_public_id DEFAULT NEWID(),
    verification_case_id BIGINT NOT NULL,
    death_document_record_id BIGINT NULL,
    original_will_intake_id BIGINT NULL,
    original_file_name NVARCHAR(255) NOT NULL,
    content_type NVARCHAR(150) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    sha256_hash CHAR(64) NOT NULL,
    encrypted_file_content VARBINARY(MAX) NOT NULL,
    encryption_iv BINARY(12) NOT NULL,
    encryption_key_version NVARCHAR(50) NOT NULL,
    uploaded_by_user_id BIGINT NOT NULL,
    uploaded_at DATETIME2(7) NOT NULL CONSTRAINT DF_staff_intake_attachments_uploaded_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_staff_intake_attachments_public_id UNIQUE (public_id),
    CONSTRAINT FK_staff_intake_attachments_case FOREIGN KEY (verification_case_id)
        REFERENCES dbo.verification_cases(verification_case_id),
    CONSTRAINT FK_staff_intake_attachments_death FOREIGN KEY (death_document_record_id)
        REFERENCES dbo.death_document_records(death_document_record_id),
    CONSTRAINT FK_staff_intake_attachments_will FOREIGN KEY (original_will_intake_id)
        REFERENCES dbo.original_will_intakes(original_will_intake_id),
    CONSTRAINT FK_staff_intake_attachments_user FOREIGN KEY (uploaded_by_user_id) REFERENCES dbo.users(user_id),
    CONSTRAINT CK_staff_intake_attachments_one_subject CHECK (
        (death_document_record_id IS NOT NULL AND original_will_intake_id IS NULL)
        OR (death_document_record_id IS NULL AND original_will_intake_id IS NOT NULL)),
    CONSTRAINT CK_staff_intake_attachments_size CHECK (file_size_bytes > 0),
    CONSTRAINT CK_staff_intake_attachments_hash CHECK (LEN(sha256_hash) = 64)
);
CREATE INDEX IX_staff_intake_attachments_death
    ON dbo.staff_intake_attachments(death_document_record_id, attachment_id) WHERE death_document_record_id IS NOT NULL;
CREATE INDEX IX_staff_intake_attachments_will
    ON dbo.staff_intake_attachments(original_will_intake_id, attachment_id) WHERE original_will_intake_id IS NOT NULL;
GO
CREATE TRIGGER dbo.TR_staff_intake_attachments_immutable ON dbo.staff_intake_attachments
AFTER UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted) OR EXISTS (SELECT 1 FROM deleted)
        THROW 51320, 'Staff intake attachments are immutable.', 1;
END;
GO
