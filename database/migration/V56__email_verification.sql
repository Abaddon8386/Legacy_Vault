-- PS-116. Email-ownership verification for password-registered accounts.
-- Additive only: no backfill, users.email_verified_at is untouched (NULL stays NULL until a credential is consumed).
-- The raw credential never reaches the database; only its purpose-prefixed SHA-256 hash is stored.
CREATE TABLE dbo.email_verification_credentials (
    credential_id BIGINT IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES dbo.users(user_id),
    credential_hash CHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL UNIQUE,
    -- HMAC of the normalized email the credential was mailed to; an email change makes the credential unusable.
    email_fingerprint CHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    purpose VARCHAR(30) NOT NULL CONSTRAINT DF_email_verification_purpose DEFAULT 'EMAIL_VERIFICATION',
    generation INT NOT NULL,
    created_at DATETIME2 NOT NULL,
    expires_at DATETIME2 NOT NULL,
    consumed_at DATETIME2 NULL,
    revoked_at DATETIME2 NULL,
    CONSTRAINT CK_email_verification_purpose CHECK (purpose='EMAIL_VERIFICATION'),
    CONSTRAINT CK_email_verification_generation CHECK (generation>=1),
    CONSTRAINT CK_email_verification_expiry CHECK (expires_at>created_at),
    CONSTRAINT CK_email_verification_terminal CHECK (consumed_at IS NULL OR revoked_at IS NULL),
    CONSTRAINT UQ_email_verification_generation UNIQUE (user_id,generation)
);
CREATE INDEX IX_email_verification_user ON dbo.email_verification_credentials(user_id,expires_at);
-- Delivery state is separate from credential state: QUEUED/CLAIMED/PREPARED are not "sent";
-- only ACCEPTED means the mail provider accepted the message (still not proof of inbox delivery).
CREATE TABLE dbo.email_verification_jobs (
    job_id BIGINT IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES dbo.users(user_id),
    email_fingerprint CHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    locale VARCHAR(2) NOT NULL,
    requested_at DATETIME2 NOT NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT DF_email_verification_job_status DEFAULT 'QUEUED',
    CONSTRAINT CK_email_verification_job_status CHECK (status IN ('QUEUED','CLAIMED','PREPARED','ACCEPTED','FAILED','SKIPPED')),
    CONSTRAINT CK_email_verification_job_locale CHECK (locale IN ('vi','en'))
);
CREATE INDEX IX_email_verification_queue ON dbo.email_verification_jobs(status,job_id);
CREATE INDEX IX_email_verification_job_user ON dbo.email_verification_jobs(user_id,job_id);
