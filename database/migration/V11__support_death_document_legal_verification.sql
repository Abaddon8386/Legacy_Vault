/*
 * V10 — Reuse dbo.legal_verifications for legal death-document decisions.
 *
 * SQL Server / Flyway migration.
 * Existing result values are intentionally preserved to avoid breaking the
 * existing WILL verification flow.
 */

SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- Existing WILL verification rows keep legal_document_id populated.
ALTER TABLE dbo.legal_verifications
    ALTER COLUMN legal_document_id BIGINT NULL;
GO

-- Add the death-document reference in a separate batch. This prevents SQL
-- Server from compiling later constraints before it recognizes the new column.
ALTER TABLE dbo.legal_verifications
    ADD death_document_record_id BIGINT NULL;
GO

ALTER TABLE dbo.legal_verifications
    ADD CONSTRAINT FK_legal_verifications_death_document_record
        FOREIGN KEY (death_document_record_id)
        REFERENCES dbo.death_document_records(death_document_record_id);
GO

-- Each verification must reference exactly one document source.
ALTER TABLE dbo.legal_verifications
    ADD CONSTRAINT CK_legal_verifications_exactly_one_document
        CHECK (
            (legal_document_id IS NOT NULL AND death_document_record_id IS NULL)
            OR
            (legal_document_id IS NULL AND death_document_record_id IS NOT NULL)
        );
GO

-- For death-document verification, finalized decisions require actor, time,
-- and a nonblank reason. Pending decisions may omit these fields.
ALTER TABLE dbo.legal_verifications
    ADD CONSTRAINT CK_legal_verifications_death_decision_details
        CHECK (
            death_document_record_id IS NULL
            OR result = 'PENDING'
            OR (
                verifier_user_id IS NOT NULL
                AND decided_at IS NOT NULL
                AND NULLIF(LTRIM(RTRIM(remarks)), N'') IS NOT NULL
            )
        );
GO

CREATE INDEX IX_legal_verifications_death_record_requested
    ON dbo.legal_verifications(death_document_record_id, requested_at)
    WHERE death_document_record_id IS NOT NULL;
GO

COMMIT TRANSACTION;
GO
