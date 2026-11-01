/* Distribution workflow (PR #226 contract): append-only decisions that separate the document request, the document
   assessment and the allocation review. The phase is derived from these events plus the dossier; nothing here moves
   a vault. Additive only. */
CREATE TABLE dbo.distribution_workflow_events (
    event_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_distribution_workflow_events PRIMARY KEY,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_distribution_workflow_events_public UNIQUE,
    verification_case_id BIGINT NOT NULL REFERENCES dbo.verification_cases(verification_case_id),
    event_no INT NOT NULL CHECK (event_no >= 1),
    action VARCHAR(40) NOT NULL CONSTRAINT CK_distribution_workflow_events_action CHECK (action IN (
        'REQUEST_DOCUMENTS','APPROVE_DOCUMENTS','REQUEST_DOCUMENT_SUPPLEMENTATION',
        'SUBMIT_ALLOCATIONS','APPROVE_ALLOCATIONS','REQUEST_ALLOCATION_CHANGES')),
    actor_user_id BIGINT NOT NULL REFERENCES dbo.users(user_id),
    reason NVARCHAR(1000) NULL,
    document_version INT NULL,
    document_sha256 CHAR(64) NULL,
    allocation_version INT NULL,
    allocation_sha256 CHAR(64) NULL,
    created_at DATETIME2(7) NOT NULL CONSTRAINT DF_distribution_workflow_events_created DEFAULT SYSUTCDATETIME(),
    /* Two concurrent actions cannot both take the same step number. */
    CONSTRAINT UQ_distribution_workflow_events_case_no UNIQUE (verification_case_id, event_no),
    CONSTRAINT CK_distribution_workflow_events_reason CHECK (
        action = 'SUBMIT_ALLOCATIONS' OR action = 'APPROVE_ALLOCATIONS' OR action = 'APPROVE_DOCUMENTS'
        OR LEN(LTRIM(RTRIM(COALESCE(reason, '')))) > 0),
    CONSTRAINT CK_distribution_workflow_events_document CHECK (
        action = 'REQUEST_DOCUMENTS' OR (document_version >= 1 AND document_sha256 IS NOT NULL)),
    CONSTRAINT CK_distribution_workflow_events_allocation CHECK (
        action NOT IN ('SUBMIT_ALLOCATIONS','APPROVE_ALLOCATIONS','REQUEST_ALLOCATION_CHANGES')
        OR (allocation_version >= 1 AND allocation_sha256 IS NOT NULL))
);
