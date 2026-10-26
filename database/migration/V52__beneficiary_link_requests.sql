/* BE-01: recipient-submitted link requests confirmed by Staff at the counter. Additive only.
   A request never links an account by itself; approval (Staff) creates the link in the same transaction. */
CREATE TABLE dbo.beneficiary_link_requests (
    link_request_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_beneficiary_link_requests PRIMARY KEY,
    public_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_beneficiary_link_requests_public UNIQUE,
    requester_user_id BIGINT NOT NULL REFERENCES dbo.users(user_id),
    verification_case_id BIGINT NOT NULL REFERENCES dbo.verification_cases(verification_case_id),
    status VARCHAR(20) NOT NULL
        CONSTRAINT CK_beneficiary_link_requests_status CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED','EXPIRED')),
    beneficiary_id BIGINT NULL REFERENCES dbo.beneficiaries(beneficiary_id),
    decided_by_user_id BIGINT NULL REFERENCES dbo.users(user_id),
    decided_at DATETIME2(7) NULL,
    expires_at DATETIME2(7) NOT NULL,
    created_at DATETIME2(7) NOT NULL CONSTRAINT DF_beneficiary_link_requests_created DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2(7) NOT NULL CONSTRAINT DF_beneficiary_link_requests_updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_beneficiary_link_requests_decision CHECK (
        (status = 'APPROVED' AND beneficiary_id IS NOT NULL AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
        OR (status IN ('REJECTED','CANCELLED','EXPIRED') AND beneficiary_id IS NULL AND decided_at IS NOT NULL)
        OR (status = 'PENDING' AND beneficiary_id IS NULL AND decided_at IS NULL))
);
/* One open request per account and case; a retry cannot create a duplicate. */
CREATE UNIQUE INDEX UX_beneficiary_link_requests_pending ON dbo.beneficiary_link_requests(requester_user_id, verification_case_id)
    WHERE status = 'PENDING';
/* A recipient record can be the target of at most one approved request. */
CREATE UNIQUE INDEX UX_beneficiary_link_requests_approved ON dbo.beneficiary_link_requests(beneficiary_id)
    WHERE status = 'APPROVED';
CREATE INDEX IX_beneficiary_link_requests_case ON dbo.beneficiary_link_requests(verification_case_id, status);
