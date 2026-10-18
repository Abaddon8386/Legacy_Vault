# PS-72 — V30 INSERT/OUTPUT review fix

## Finding and change

Leader review identified that V30's 26 AFTER INSERT,UPDATE,DELETE triggers reject
identity inserts using OUTPUT INSERTED without INTO, even when the Vault is ACTIVE.
This is SQL Server error 334, not an ownership, quota or validation error.
The original V30 implementation was incorrect for the project's identity insert pattern.

Changed every one of these 26 trigger declarations to AFTER UPDATE,DELETE.
The existing archived-Vault trigger remains UPDATE/DELETE only.
No trigger is disabled globally, and no OUTPUT/identity retrieval behavior is changed.

Primary reference:
[Microsoft SQL Server OUTPUT and triggers](https://learn.microsoft.com/en-us/sql/t-sql/queries/output-clause-transact-sql#triggers).
The restriction applies to triggers for the corresponding DML action.

## INSERT boundary and service review

The database now intentionally permits raw INSERT, including into an archived Vault.
Supported application writes must enforce archive protection in their transaction:

- Asset, Will and file-version creation already use requireEditableVaultForUpdate.
  It locks the owned Vault, refreshes state, then checks ACTIVE before persistence.
- Trustee/Beneficiary create/update/revoke now use the same locked/refreshed guard
  instead of checking an unlocked snapshot.
- DMS configuration uses the locked ACTIVE guard. Check-in uses the new
  requireNotArchivedVaultForUpdate before locking/updating DMS, preserving its
  existing MONITORING policy and Vault → DMS lock order.
- Scheduler now locks and refreshes Vault before trigger writes/audit. Grace expiry
  refreshes both Vault and DMS before deciding whether to create a verification case.
  ARCHIVED/cached ACTIVE cannot create a new case or append a DMS trigger audit.
- Staff death-document/original-will intake holds the case lock; it now refreshes the
  managed case before checking OPEN. Archive closes that same case in its transaction,
  so cached OPEN cannot admit a post-close intake record.
- Contact/identity/account-link writes use the shared assigned-OPEN-case predicate
  under the Vault lock; closed archived cases do not match that database predicate.
- Legal decision/comparison paths check their permitted Vault state and OPEN case.
  Dossier/forward/classification/hold/approval use LegalBasisCaseAccess with refresh.
- Session/delivery/receipt/reconciliation/completion paths require the locked current
  workflow and OPEN case, and check session lifecycle before INSERT.
- Audit/history INSERTs remain allowed intentionally. Existing rows/files are retained.
  Direct SQL access is outside these service guards; there is no claim that raw
  INSERT is blocked at the database boundary after this correction.

## Validation

1. **V30InsertOutputSqlServerTest: 3 pass, 0 failure/error/skip**, real SQL Server:
   - INSERT ... OUTPUT INSERTED.* succeeds for assets, beneficiaries, trustees and
     verification_cases with the actual corresponding trigger definitions read from V30.
   - UPDATE and DELETE still fail with numeric error 51300 after archive.
   - sys.trigger_events reports no INSERT event for these triggers; raw INSERT into
     ARCHIVED intentionally succeeds, documenting the service boundary.
   - Fixture creates/drops only LegacyVault_V30Trigger_<random GUID>.
   - These are minimal representative tables, not the full production schema,
     a Hibernate boot test or a full Flyway validation; V25 is not run or changed.
2. **Unit/API regression: 593 tests, 484 pass, 109 opt-in skipped, 0 failure/error**:
   mvnw.cmd -Dtest=*,!LegacyvaultBackendApplicationTests clean test
   contextLoads is excluded separately. The SQL test above is skipped in this
   no-DB regression and was executed successfully in its own opt-in run.
3. New service tests cover actual VaultService refresh turning cached ACTIVE into
   ARCHIVED before Asset/Will/Trustee/Beneficiary/DMS writes; no child save, encryption
   or business audit occurs. Other tests simulate cached OPEN becoming CLOSED before
   Staff intake, and cached ACTIVE becoming ARCHIVED before scheduler case creation.
4. git diff --check; V25 remains unchanged compared with origin/develop.

Logs are ignored: backend/ps72-review-output-sql.log,
backend/ps72-v30-review-regression.log and backend/ps72-review-services.log.

Full PS-67–72 SQL/Flyway/JPA integration remains pending the PS-61/V25 fix by Long,
as requested by the user. The targeted test is not a replacement for those suites.
No existing database was reset, repaired or had its schema history/checksum edited.

## Delivery

Update only feature/PS-72-archive-vault-close-case and existing Draft PR #115,
target develop. No new remote branch/PR and no merge. This fixes the migration source
under review; it does not update any already-migrated local/shared database.
