-- PS-106: preserve the exact email Staff confirmed at the counter as an immutable snapshot.
-- Existing attestations remain NULL; they are not retroactively treated as email-confirmed.
ALTER TABLE dbo.beneficiary_counter_attestations
    ADD confirmed_email NVARCHAR(254) NULL;
