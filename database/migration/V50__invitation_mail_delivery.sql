-- Additive follow-up to V46. Legacy rows lack an authenticated request context and are not sent.
ALTER TABLE dbo.beneficiary_invitation_mail_outbox ADD
    verification_case_id BIGINT NULL REFERENCES dbo.verification_cases(verification_case_id),
    requested_by_user_id BIGINT NULL REFERENCES dbo.users(user_id),
    processed_at DATETIME2(7) NULL;
ALTER TABLE dbo.beneficiary_invitation_mail_outbox DROP CONSTRAINT CK_beneficiary_invitation_mail_outbox_status;
ALTER TABLE dbo.beneficiary_invitation_mail_outbox ADD CONSTRAINT CK_beneficiary_invitation_mail_outbox_status
    CHECK (transport_status IN ('QUEUED','CLAIMED','SENDING','ACCEPTED','FAILED','UNKNOWN','SKIPPED'));
CREATE INDEX IX_invitation_mail_claim ON dbo.beneficiary_invitation_mail_outbox(transport_status,outbox_id);
