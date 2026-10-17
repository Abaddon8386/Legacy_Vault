# PS-45 patch validation — 2026-10-17

PS-45 merges patched PS-44, which merges develop `7205d17`. Existing PRs #47/#48 are reused.
No rebase, force push, develop push, merge of a PR, or PS-77 code integration.

POST/GET use the shared OPEN/assigned/Vault guard. Write refreshes the Beneficiary after locks,
appends history, updates canonical status, and audits in one transaction. Arbitrary String status
assignment is removed; `MATCH` uses `verifyAtCounter()` and `VERIFIED_AT_COUNTER`, while `NOT_MATCH`
uses `markIdentityNotVerified()` and `NOT_VERIFIED`, including from VERIFIED_AT_COUNTER.
Audit metadata is whitelisted; issuer, suffix, notes, and identity documents are excluded.

The user confirmed both business policies on 2026-10-17: every new NOT_MATCH resets current status
to NOT_VERIFIED even after VERIFIED_AT_COUNTER, and REVOKED Trustees cannot receive new contacts.
Both identity outcomes append unchanged results and return 201. The temporary NOT_MATCH 409 error,
message and contract are removed. Current state follows the last result processed under the locks.
Trustee revocation policy is included from PS-44; unauthorized targets still receive 404 first.

Validation with repository Maven wrapper / JDK 25:

- `-Dtest=IdentityVerification*Test test` with STAFF_SQLSERVER_MASTER_URL: 30 passed, 0 failed/skipped:
  12 service/controller + 18 real SQL tests (10 identity scenarios + 8 inherited PS-44 regression scenarios).
- `test`: 269 discovered; 240 passed, 1 error, 28 skipped. BUILD FAILURE.
  contextLoads fails on duplicate Flyway V7; V8 is also duplicated on disk. Opt-in SQL suites
  are skipped in ordinary regression and run explicitly above. No failed test was excluded to claim green.
- SQL Server tests verify both Cancel Alert orders, two concurrent MATCH writes, mixed MATCH/NOT_MATCH
  writes in BOTH serialized orders with matching final state and complete history, denied SQL row shapes,
  NOT_MATCH from both prior states, and real audit-failure rollback of history AND status for both outcomes.
  A failed NOT_MATCH retains an earlier VERIFIED_AT_COUNTER status and its successful MATCH history/audit.
- The SQL harness creates/drops only its random LegacyVault_StaffPatch_* DB. Develop's 12 migrations
  run via Flyway; unchanged feature SQL is applied as schema fixtures. This does NOT prove branch-wide
  Flyway integration; feature version allocation remains blocked.
- Local logs: backend/target/ps45-policy-focused.log, ps45-policy-regression.log (ignored).
- git diff --check and strict UTF-8 decoding of changed messages passed.

Data repair: `scripts/testing/ps45-identity-status-preflight.sql` is read-only and reports canonical/unknown
states and invalid MATCH/NOT_MATCH state counts versus latest history. It has NOT been run on real data.
NOT_MATCH mapping is now approved. No repair migration is issued until affected deployment scope
and migration version are confirmed;
unknown states must never be silently normalized. Existing history is untouched.

Remaining blockers: the team confirmed migration numbers are not allocated (V12/V13 belong to PS-77,
V14+ reserved per review); Staff target-discovery API (case DTO exposes
Vault/Owner IDs only). Keep both PRs out of merge until applicable blockers are resolved.
Integrate PS-44 before PS-45. OPEN cases never imply PS-46–48 legal clearance.
