/*
 * ST-09: Chỉ cho phép một Verification Case OPEN trên mỗi Vault.
 * Case CANCELLED/CLOSED vẫn được giữ lại làm lịch sử.
 */

IF EXISTS (
    SELECT 1
    FROM dbo.verification_cases
    WHERE status = N'OPEN'
    GROUP BY vault_id
    HAVING COUNT(*) > 1
)
BEGIN
    THROW 51009,
        'Duplicate OPEN verification cases exist. Resolve them before applying V9.',
        1;
END;
GO

CREATE UNIQUE INDEX UX_verification_cases_vault_open
    ON dbo.verification_cases(vault_id)
    WHERE status = N'OPEN';
GO