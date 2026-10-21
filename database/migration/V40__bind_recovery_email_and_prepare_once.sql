-- PS-112 security review. Do not edit V39/checksums on installations that already applied it.
ALTER TABLE dbo.password_reset_credentials ADD email_fingerprint CHAR(64) COLLATE Latin1_General_100_BIN2 NULL;
GO
-- Previously issued V39 links have no proof of the current email binding; fail closed on upgrade.
-- Preserve consumed history, hashes, user passwords, versions, roles and provider identities.
UPDATE dbo.password_reset_credentials SET revoked_at=SYSUTCDATETIME()
WHERE email_fingerprint IS NULL AND consumed_at IS NULL AND revoked_at IS NULL;
-- An older writer must not create another usable unbound link after this upgrade.
ALTER TABLE dbo.password_reset_credentials ADD CONSTRAINT CK_reset_email_binding
    CHECK (email_fingerprint IS NOT NULL OR consumed_at IS NOT NULL OR revoked_at IS NOT NULL);
ALTER TABLE dbo.password_recovery_jobs DROP CONSTRAINT CK_recovery_job_status;
ALTER TABLE dbo.password_recovery_jobs ADD CONSTRAINT CK_recovery_job_status
    CHECK (status IN ('QUEUED','CLAIMED','PREPARED','ACCEPTED','FAILED','SKIPPED'));
