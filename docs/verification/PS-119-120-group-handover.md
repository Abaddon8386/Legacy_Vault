# PS-119/120 verification — 2026-10-30

Base develop: 75ae03f. Branch: feature/PS-119-120-group-handover.
Confirmed decisions: direct beneficiaries only; new session/assignment/approval/allocation or
new attendance invalidates the old report/request. No guardian substitution, no timer/partial holds.

PASS: runtime API and append-only V56 schema; missing report atomically represents whole-case
suspension, all-present report cannot clear it, Staff request then Legal decision required.
PASS (unit): current snapshot, stale request, independent direct-recipient set, default deny,
revision conflict, same committed retry without extra mutation, audit exception propagation.
PASS (MockMvc): anonymous 401, other roles 403, Staff attendance and Legal decision accepted,
out-of-scope error 404.
PASS: direct delivery calling service cannot bypass group gate; gate is invoked before item writes.
PASS: existing handover and full non-SQL regression suite after error enum contract sync.
OpenAPI enum also lacked existing ASSET_REQUIRED/WILL_REQUIRED; now synchronized with runtime.

Runs:
- Maven clean test excluding *SqlServerTest and LegacyvaultBackendApplicationTests:
  780 tests total, 777 passed, 3 skipped, 0 failure/error.
- Subsequent targeted runs include four additional non-SQL tests (direct bypass, retry,
  Legal allowed, scope error) and two conditional SQL tests.
- Combined final Surefire reports: 786 total, 781 passed, 5 skipped, 0 failure/error.
- JSON contract/fixture parse, runtime paths checked, git diff --check passed.
- V56 unique against fetched develop; existing migrations untouched.
These are local results, not GitHub CI, FE browser E2E or real SQL proof.

NOT VERIFIED: actual V56 migration, SQL transaction rollback, simultaneous delivery/suspension/
reopen, process restart and FE multi-role E2E. LEGAL_SQLSERVER_MASTER_URL and DB_URL absent;
localhost:1433 unreachable. SQL schema/rollback and retry-constraint tests are included but
both skipped. Fixture creates/drops only LegacyVault_LegalTest_<random UUID>, using the
existing master-URL harness and its database-name deletion safety check. No app/shared DB changed.

Runtime impact: old clients must record attendance using the new API or delivery/confirmation/
receipt/close/archive now return GROUP_HANDOVER_BLOCKED. History read APIs retain existing policy.
PS-121/122/123 and Legal UI should reuse the published contract; no UI is delivered in this PR.
notification receipt remains null; HANDOVER_GROUP_CHANGED audit and persisted group events are
available for subsequent PS-135 integration without claiming notification delivery.
Team review of PS-119 contract and SQL/E2E evidence are still required for ticket acceptance.
