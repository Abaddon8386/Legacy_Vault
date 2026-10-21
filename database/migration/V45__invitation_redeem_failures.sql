CREATE TABLE dbo.invitation_redeem_failures (
    failure_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_invitation_redeem_failures PRIMARY KEY,
    account_id BIGINT NOT NULL,
    code_hash CHAR(64) NULL,
    failed_at DATETIME2(7) NOT NULL CONSTRAINT DF_invitation_redeem_failures_failed_at DEFAULT SYSUTCDATETIME()
);

CREATE INDEX IX_invitation_redeem_failures_account_time
    ON dbo.invitation_redeem_failures(account_id, failed_at);

CREATE INDEX IX_invitation_redeem_failures_account_code_time
    ON dbo.invitation_redeem_failures(account_id, code_hash, failed_at);

-- No FK to users: failures are inserted in REQUIRES_NEW while the redeem transaction
-- holds that user's write lock. Account ids are internal identifiers and are never returned.
