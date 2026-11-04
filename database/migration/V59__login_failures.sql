CREATE TABLE dbo.login_failures (
    failure_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_login_failures PRIMARY KEY,
    email_hash CHAR(64) NOT NULL,
    client_ip VARCHAR(45) NULL,
    failed_at DATETIME2(7) NOT NULL CONSTRAINT DF_login_failures_failed_at DEFAULT SYSUTCDATETIME()
);

CREATE INDEX IX_login_failures_email_time
    ON dbo.login_failures(email_hash, failed_at);

CREATE INDEX IX_login_failures_ip_time
    ON dbo.login_failures(client_ip, failed_at);

-- Only a SHA-256 of the normalized email is stored, never the address itself. Rows older than the
-- 15 minute window are ignored by the limiter and are cleaned up whenever a new failure is recorded.
