-- PS-85: Google identities are explicitly provisioned; Google login never creates or links a user.
CREATE TABLE dbo.external_auth_identities (
    external_auth_identity_id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_external_auth_identities PRIMARY KEY,
    provider_code NVARCHAR(30) COLLATE Latin1_General_100_BIN2 NOT NULL,
    subject NVARCHAR(255) COLLATE Latin1_General_100_BIN2 NOT NULL,
    user_id BIGINT NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_external_auth_identities_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_external_auth_identities_user FOREIGN KEY (user_id) REFERENCES dbo.users(user_id),
    CONSTRAINT CK_external_auth_identities_google_only CHECK (provider_code = 'GOOGLE'),
    CONSTRAINT UQ_external_auth_identities_provider_subject UNIQUE (provider_code, subject)
);

CREATE INDEX IX_external_auth_identities_user_id
    ON dbo.external_auth_identities(user_id);

-- Store only a SHA-256 fingerprint, never the Google credential itself.
CREATE TABLE dbo.google_login_credential_uses (
    credential_hash CHAR(64) NOT NULL CONSTRAINT PK_google_login_credential_uses PRIMARY KEY,
    expires_at DATETIME2 NOT NULL
);

CREATE INDEX IX_google_login_credential_uses_expires_at
    ON dbo.google_login_credential_uses(expires_at);
