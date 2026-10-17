# PS-44 patch validation — 2026-10-17

Base: develop `7205d17`. Existing PR #47 is reused; PS-45 remains stacked on PS-44.
Latest leader instruction assigns `V12__trustee_contact_outcomes.sql` to PS-44. The former
contact migration was renamed without changing its SQL contents; the conflicting old filename is gone.

POST/GET require an OPEN verification case assigned to the actor for the target Vault.
Writes lock Vault then Case, refresh/lock the Trustee, and commit history and audit together.
REVOKED Trustees reject new contacts with 409 TRUSTEE_REVOKED after authorization; existing
history remains readable under the case guard. Inaccessible targets still return 404.

## Validation

- Full `backend/mvnw.cmd test`, STAFF_SQLSERVER_MASTER_URL enabled: **242 discovered,
  239 passed, 0 failures/errors, 3 skipped**. BUILD SUCCESS, including contextLoads.
- The 3 skipped tests are the separate opt-in DmsSqlServerConcurrencyTest suite.
- PS-44 SQL suite: 10 passed, including full Flyway history/validation, upgrade from V11 to V12,
  both Cancel Alert orders, denied row shapes, append-only contacts, audit rollback, unique OPEN
  case enforcement, REVOKED rejection, stale entity refresh after concurrent revocation, and audit ISJSON.
- contextLoads migrates an empty temporary database through the complete branch's 13 migrations.
  The SQL service suite first migrates to V11, then Spring Flyway applies V12 and validates the real
  branch scripts. No feature SQL is applied as a fixture or excluded from Flyway anymore.
- Actual Hibernate SQL includes SQL Server UPDLOCK/HOLDLOCK/ROWLOCK on Vault, Case and Trustee.
- Audit adapter persists MONITORING, APPOINTED and NOT_CONFIGURED as JSON status objects;
  SQL Server ISJSON checks succeed for state_before and state_after.
- Logs: `backend/ps44-migrations-focused.log` (initial migration check),
  `backend/ps44-migrations-regression.log` (final complete run), ignored by Git.
- All databases used by these runs are random LegacyVault_StaffPatch_* databases created and removed
  by this task. No LegacyVault/shared database, Flyway history, checksum or repair was changed.

## Review reconciliation

The older audit/encryption/Grace Period observations are already fixed in this branch: the audit
adapter serializes JSON; IdentityNumberCipher uses the shared EncryptionService with IV/key version;
README, application.yaml and beneficiaries.md use LEGACYVAULT_ENCRYPTION_KEY; DmsPolicy reads
DMS_GRACE_PERIOD_DAYS; StaffContextService delegates actor resolution; no OwnerVaultService duplicate
remains. These implementations were inspected and existing regression tests pass.

V5_1__dms_grace_period_default.sql is already part of develop; V9 is the OPEN-case uniqueness migration.
Do not rename either existing migration based on the historical suggestion, reset a shared DB, or run repair.
An environment that applied older branch-specific migrations needs a deployment-specific history assessment.

The Trustee message key is grouped with existing Trustee keys instead of appended at EOF, avoiding the
actual messages-file collision with PS-41–43. Other teams' enums/errors/messages/contracts are not removed
or copied into this branch; no PS-38–43 implementation or PS-77 code is introduced by this follow-up.

## Remaining integration dependencies

The leader's V12/V13 instruction removes duplicates with current develop/main. However, open PS-77 #64
still contains its own V12/V13: coordinate that separate branch before integrating both feature streams.
PS-77 migrations are unchanged here. PS-41–43 use V14/V15 and are preserved.

Staff still needs an API to discover target Trustee IDs from its assigned case; Owner endpoints and UUID
entry are not a supported substitute. OPEN cases do not imply PS-46–48 legal clearance.
Merge PS-44 before PS-45; do not claim the cross-branch numbering issue resolved for PS-77.
