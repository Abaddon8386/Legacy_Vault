-- PS-140: the manual evidence reference of a counter identity attestation is optional.
-- The attestation row itself (assigned Staff, UTC time, case, Beneficiary, optional confirmed email) is the evidence;
-- no placeholder reference is ever generated. Existing rows are untouched (the table stays immutable).
ALTER TABLE dbo.beneficiary_counter_attestations DROP CONSTRAINT CK_beneficiary_counter_attestations_reference;
GO
ALTER TABLE dbo.beneficiary_counter_attestations ALTER COLUMN evidence_reference NVARCHAR(200) NULL;
GO
ALTER TABLE dbo.beneficiary_counter_attestations ADD CONSTRAINT CK_beneficiary_counter_attestations_reference
    CHECK(evidence_reference IS NULL OR LEN(LTRIM(RTRIM(evidence_reference))) > 0);
GO
