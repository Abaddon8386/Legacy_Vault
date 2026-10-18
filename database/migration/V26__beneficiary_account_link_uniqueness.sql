/*
 * LegacyVault - V26 (PS-62 / PS-63, ST-24)
 * Purpose:
 *   - A user account may be linked to at most one Beneficiary record per Vault (final DB guard; the service also
 *     checks under the Vault lock). The same account may still be a Beneficiary of different Vaults.
 *   - Beneficiary account_status values are constrained to the documented values.
 * Safety:
 *   - Existing data is only inspected; the migration stops with an error instead of changing or deleting rows.
 */
IF EXISTS (
    SELECT vault_id, linked_user_id
    FROM dbo.beneficiaries
    WHERE linked_user_id IS NOT NULL
    GROUP BY vault_id, linked_user_id
    HAVING COUNT_BIG(*) > 1
)
    THROW 51270, 'An account is linked to several Beneficiary records of one Vault. Review data before V26; no rows were changed.', 1;

IF EXISTS (
    SELECT 1 FROM dbo.beneficiaries
    WHERE account_status NOT IN (N'NOT_CREATED', N'ACCOUNT_CREATED')
)
    THROW 51271, 'Unexpected beneficiaries.account_status value. Review data before V26; no rows were changed.', 1;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_beneficiaries_vault_linked_user'
      AND object_id = OBJECT_ID(N'dbo.beneficiaries')
)
    CREATE UNIQUE INDEX UX_beneficiaries_vault_linked_user
        ON dbo.beneficiaries(vault_id, linked_user_id)
        WHERE linked_user_id IS NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_beneficiaries_account_status'
      AND parent_object_id = OBJECT_ID(N'dbo.beneficiaries')
)
    ALTER TABLE dbo.beneficiaries ADD CONSTRAINT CK_beneficiaries_account_status
        CHECK (account_status IN (N'NOT_CREATED', N'ACCOUNT_CREATED'));
GO
