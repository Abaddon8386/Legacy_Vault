# PS-45 patch validation — 2026-10-17

PS-45 merges patched PS-44 on develop `7205d17`; existing PRs #47/#48 are reused.
Latest leader instruction assigns `V12__trustee_contact_outcomes.sql` to PS-44 and
`V13__beneficiary_identity_verifications.sql` to PS-45. Both renames preserve SQL contents.
The conflicting old feature filenames are removed; no Dương/PS-77 migrations are changed.

POST/GET use the OPEN/assigned/Vault guard. Writes lock Vault then Case, refresh the Beneficiary,
append history, update canonical current status and audit in one transaction. MATCH sets
VERIFIED_AT_COUNTER; NOT_MATCH sets NOT_VERIFIED even after VERIFIED_AT_COUNTER. Both retain
unchanged history results and return 201. Concurrent current status follows the last serialized result.
Audit excludes issuer, suffix, notes and identity documents. Confirmed REVOKED Trustee policy is
inherited from PS-44; inaccessible targets always receive 404 before business-state checks.

## Validation

- Full `backend/mvnw.cmd clean test` with STAFF_SQLSERVER_MASTER_URL enabled: **274 discovered,
  271 passed, 0 failures/errors, 3 skipped**. BUILD SUCCESS, including contextLoads.
- The 3 skipped tests belong to the separate opt-in DmsSqlServerConcurrencyTest suite.
- Identity SQL suite: 20 passed (10 identity + 10 inherited PS-44 scenarios). The standalone
  Trustee SQL suite also passes all 10 tests against the stacked schema.
- contextLoads migrates an empty temporary database through all 14 branch migrations.
  The SQL service suites migrate to V11, then Spring Flyway applies V12 and V13 and validates the
  actual full-branch scripts/history/checksums. No feature SQL fixtures or migration exclusions remain.
- Real SQL tests cover both Cancel Alert orders, concurrent MATCH writes, mixed MATCH/NOT_MATCH
  in BOTH serialized orders with consistent final state/full history, NOT_MATCH from both prior
  states, denied SQL row shapes and audit-failure rollback for both outcomes. A failed NOT_MATCH
  preserves prior VERIFIED_AT_COUNTER plus its earlier MATCH history/audit.
- Actual SQL Server UPDLOCK/HOLDLOCK/ROWLOCK observed. Inherited tests verify audit ISJSON and
  REVOKED Trustees, including stale entities loaded before concurrent revocation.
- Full regression log: `backend/ps45-migrations-regression.log` (ignored).
- git diff --check and strict UTF-8 decoding of messages passed. Build was clean to remove stale
  copied migration resources after renaming; no shared database was reset or repaired.

## Review and integration

Older audit JSON, encryption variable/key version, configurable Grace Period and duplicate service
observations are already resolved in current code; see PS-44-patch.md. Existing V5.1 is retained:
V9 is already used by OPEN-case uniqueness and applied migrations must not be blindly renamed.

The only actual shared-file merge conflicts found against main/PS-38–43 were messages files.
The Trustee key is now grouped beside existing Trustee keys instead of at EOF. Synthetic Git merges
with develop, main and each PS-38/39/40-followup/41/42/43 branch are clean; AuditAction, ErrorCode,
messages, OpenAPI and error contract preserve both sides. This is a conflict check, not a deployment
or a full test of the combined PS-38–43 runtime. No other team's implementation is pulled into the PR.

The requested V12/V13 assignment removes duplicates with current develop/main. Open PS-77 #64
still contains its own V12/V13: coordinate that separate branch before combining both feature streams.
PS-41–43 use V14/V15 and are preserved. No PS-77 migrations were edited or merged into this branch.

Staff target-discovery remains a FE dependency: case DTO currently exposes Vault/Owner IDs, not
Trustee/Beneficiary IDs. Owner APIs and UUID entry are not supported substitutes. OPEN never means
PS-46–48 legal clearance. Integrate PS-44 before PS-45, without claiming PS-77 numbering resolved.

## Data repair

`scripts/testing/ps45-identity-status-preflight.sql` is read-only and reports canonical/unknown states
and invalid historical current-status counts versus latest history. It has not run on real data.
The business mapping is approved; a repair still needs deployment scope and its own migration version.
Unknown states and existing history must not be silently rewritten. No shared Flyway history was changed.
