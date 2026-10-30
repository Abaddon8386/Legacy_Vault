# PS-119/120 verification — 2026-10-30

Base develop: 75ae03f. Branch: feature/PS-119-120-group-handover.
Confirmed decisions: direct beneficiaries only; new session/assignment/approval/allocation or
new attendance invalidates the old report/request. No guardian substitution, no timer/partial holds.

PASS: runtime API and append-only V57 schema; missing report atomically represents whole-case
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
- V57 unique against fetched develop; existing migrations untouched.
These are local results, not GitHub CI, FE browser E2E or real SQL proof.

NOT VERIFIED: actual V57 migration, SQL transaction rollback, simultaneous delivery/suspension/
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

## Team review follow-up — 2026-10-30

The review correctly identified legacy SQL delivery fixtures that never recorded attendance,
and a V56 collision with origin/feature/PS-116-email-verification-api (email verification).
The existing delivery behavior change is intentional, but the regression fixture gap was real.

Updated HandoverCompletionSqlSupport.ready to explicitly submit all direct recipients through
GroupHandoverService with the current server revision/scope. Updated both independent court HTTP
flows and the counter-invitation reassignment case. This does not mock/disable the runtime gate.
Attendance helper cannot reopen a suspended group; new unit/conditional SQL regression checks that.
Moved this unmerged migration from V56 to V57 without changing SQL content. No database history
was edited or repaired; SQL reruns must use the existing disposable per-run fixture databases.

Latest sequential clean run: 785 non-SQL tests total, 782 passed, 3 skipped, 0 failures/errors.
Subsequent GroupHandoverSqlServerTest: 3 skipped (master URL absent).
Final reports: 788 total, 782 passed, 6 skipped, 0 failures/errors. All modified SQL fixtures compile.
One earlier overlapping Maven run had missing-class classpath errors; the sequential clean rerun
supersedes that run. HandoverFixtureContractTest passed and checks complete server recipient scope,
current revision and attendance-only behavior.
Packaged resources contain V57; V56 group file is absent. V57 did not occur in fetched remote
history; PS-116 retains its own V56. git diff --check passed.

NOT VERIFIED: the reviewer's exact 28/52 SQL regression count, their PR235 1109-test baseline,
or that all affected SQL integration scenarios now pass on SQL Server. No master URL is configured
in process/User/Machine scope. No live database was changed. Team SQL rerun is required before
claiming the 28 integration failures resolved or approving merge.
