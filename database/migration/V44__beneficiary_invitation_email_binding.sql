ALTER TABLE dbo.beneficiary_invitations
    ADD recipient_email NVARCHAR(254) NULL;

-- Existing invitation generations intentionally remain unbound and cannot be redeemed
-- through the PS-87 email-bound flow until Staff confirms and reissues them.
