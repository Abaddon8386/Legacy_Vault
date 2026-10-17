/* Read-only preflight. Run only on an explicitly selected database; no updates or default mappings.
   Does not expose identity documents. A repair migration needs an approved NOT_MATCH policy and
   confirmation of deployment/Flyway history before any data changes. Unknown states stay untouched. */
SET NOCOUNT ON;

SELECT id_verification_status, COUNT_BIG(*) AS beneficiary_count
FROM dbo.beneficiaries
GROUP BY id_verification_status;

IF OBJECT_ID(N'dbo.beneficiary_identity_verifications', N'U') IS NOT NULL
BEGIN
    ;WITH latest AS (
        SELECT beneficiary_id, result,
               ROW_NUMBER() OVER (PARTITION BY beneficiary_id ORDER BY verified_at DESC, verification_id DESC) AS rn
        FROM dbo.beneficiary_identity_verifications
    )
    SELECT b.id_verification_status, l.result AS latest_history_result, COUNT_BIG(*) AS affected_count
    FROM dbo.beneficiaries b
    LEFT JOIN latest l ON l.beneficiary_id = b.beneficiary_id AND l.rn = 1
    WHERE b.id_verification_status IN (N'MATCH', N'NOT_MATCH')
    GROUP BY b.id_verification_status, l.result;
END;
