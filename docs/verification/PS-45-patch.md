# PS-45 patch validation — 2026-10-17

PS-45 merges patched PS-44, which merges develop `7205d17`. Existing PRs #47/#48 are reused.
No rebase, force push, develop push, merge of a PR, or PS-77 code integration.

POST/GET use the shared OPEN/assigned/Vault guard. Write refreshes the Beneficiary after locks,
appends history, updates canonical status, and audits in one transaction. Arbitrary String status
assignment is removed; `MATCH` uses the domain method `verifyAtCounter()` and `VERIFIED_AT_COUNTER`.
Audit metadata is whitelisted; issuer, suffix, notes, and identity documents are excluded.

NOT_MATCH remains **unresolved**: Jira PS-45 specifies history metadata and MATCH/NOT_MATCH but no
current-state transition, including after VERIFIED_AT_COUNTER; it has no comments approving a mapping.
The review calls NOT_VERIFIED a proposal. Pending confirmation, authorized NOT_MATCH requests return
409 IDENTITY_VERIFICATION_POLICY_UNDECIDED without writes. Unauthorized targets still receive 404 first.
This is a temporary fail-closed behavior, not an approved final NOT_MATCH implementation.

Validation with repository Maven wrapper / JDK 25:

- `-Dtest=IdentityVerification*Test test` before adding the SQL suite: 12 passed, 0 failed/skipped.
- `-Dtest=IdentityVerificationSqlServerTest test` with STAFF_SQLSERVER_MASTER_URL: 13 passed,
  0 failed/skipped (7 identity scenarios + 6 inherited PS-44 regression scenarios).
- `test`: 261 discovered; 238 passed, 1 error, 22 skipped. BUILD FAILURE.
  contextLoads fails on duplicate Flyway V7; V8 is also duplicated on disk. Opt-in SQL suites
  are skipped in ordinary regression and run explicitly above. No failed test was excluded to claim green.
- SQL Server tests verify both Cancel Alert orders, two concurrent MATCH writes, preserved MATCH/NOT_MATCH
  history, denied SQL row shapes, real audit-failure rollback of history AND status, and both prior states
  rejected unchanged for unresolved NOT_MATCH. Mixed MATCH/NOT_MATCH concurrency awaits the policy.
- The SQL harness creates/drops only its random LegacyVault_StaffPatch_* DB. Develop's 12 migrations
  run via Flyway; unchanged feature SQL is applied as schema fixtures. This does NOT prove branch-wide
  Flyway integration; feature version allocation remains blocked.
- Local logs: backend/target/ps45-focused.log, ps45-sql.log, ps45-regression.log (ignored).
- git diff --check and strict UTF-8 decoding of changed messages passed.

Data repair: `scripts/testing/ps45-identity-status-preflight.sql` is read-only and reports canonical/unknown
states and invalid MATCH/NOT_MATCH state counts versus latest history. It has NOT been run on real data.
No repair migration is issued until affected deployment scope and NOT_MATCH mapping are approved;
unknown states must never be silently normalized. Existing history is untouched.

Remaining blockers: NOT_MATCH transition approval; migration allocation (V12/V13 belong to PS-77,
V14+ reserved per review); REVOKED Trustee policy; Staff target-discovery API (case DTO exposes
Vault/Owner IDs only). Keep both PRs out of merge until applicable blockers are resolved.
Integrate PS-44 before PS-45. OPEN cases never imply PS-46–48 legal clearance.
