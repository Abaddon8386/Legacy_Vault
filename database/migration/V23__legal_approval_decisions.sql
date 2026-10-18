/* PS-57 / ST-21: permit append-only legal decisions in the existing review history. */
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.legal_basis_review_history', N'U') IS NULL
    THROW 51180, 'V23 requires dbo.legal_basis_review_history from V18.', 1;

IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE parent_object_id = OBJECT_ID(N'dbo.legal_basis_review_history')
             AND name = N'CK_legal_basis_review_history_status')
    ALTER TABLE dbo.legal_basis_review_history
        DROP CONSTRAINT CK_legal_basis_review_history_status;

ALTER TABLE dbo.legal_basis_review_history
    ADD CONSTRAINT CK_legal_basis_review_history_status
        CHECK (review_status IN
               (N'REVIEW_REQUIRED', N'FRESH', N'STALE', N'INDETERMINATE',
                N'LEGAL_APPROVED', N'LEGAL_REJECTED'));
