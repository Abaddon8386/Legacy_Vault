# PS-67–72 SQL integration — 19/10/2026

## Local delivery only

User approved updating the six existing branches and running SQL integration on disposable
databases, explicitly forbidding push, new branches/PRs and merge. All six local branches
were rebased in sequence onto origin/develop b9de8b7. No remote branch or PR was modified.
Existing Draft PRs remain #112, #110, #109, #113, #114 and #115, all targeting develop.

Develop contains V25 fix a15f5bb from PR #131: one GO added between the last index and
the first CREATE TRIGGER. Author is Thai, not Long; Long's PS-61 branch still has the old
file. V25 on all six local branches is identical to develop. No migration/checksum repair,
schema-history changes, reset or bypass was used on any existing database.

The initial targeted run found a pre-existing receipt test fixture using a nonexistent
identity_verification_status column. Local commit 0c05424 on PS-67 changes it to the actual
id_verification_status column and is inherited by PS-68–72. No production schema change
was needed. PS-72 retains the earlier V30 UPDATE/DELETE-only trigger and service guard fix.

## Results on the integrated PS-72 tree

1. Initial targeted SQL run: 29 tests, 26 pass, 3 errors caused by that fixture column;
   all 18 PS-67–72 tests passed. This failed attempt is retained in ps67-72-v25-sql.log.
2. After the fixture fix, regression command at backend:

   `mvnw.cmd -Dtest=*,!LegacyvaultBackendApplicationTests clean test`

   With LEGAL_SQLSERVER_MASTER_URL selecting master and Windows integrated authentication:
   **593 tests, 538 pass, 55 skipped, 0 failures/errors**. Of these, **54 real SQL tests**
   ran across the six completion suites, session/receipt, legal route/hold/court/quota and
   the V30 OUTPUT regression. All passed without skips in those SQL suites.
3. New HandoverMigrationUpgradeSqlServerTest: **1 pass, 0 skips/failures/errors**.
   Flyway migrates a fresh temporary DB to V27 (including the corrected V25), creates an
   existing user/vault, then applies exactly V28/V29/V30. Existing vault name/status survive;
   Flyway validates all 31 migration files (including V5.1); a second migrate applies zero.

Together: **539 passing distinct tests**, including **55 SQL tests**. The 55 skips in the
regression are other opt-in environment suites (subscription/staff/scheduler); they were
not enabled. The standalone application contextLoads test remains explicitly excluded.
Legal SQL fixtures do boot the real Spring application, Flyway, JPA and service beans on
fresh databases. This does not claim browser E2E, every controller against SQL, or separate
SQL execution at each intermediate branch head.

Covered behavior includes delivery versus explicit confirmation, scope/ownership/isolation,
dual gate, retry and concurrent confirmation/close/archive, transactional audit rollback,
receipt proof/coverage, archive atomicity, retained history and archived UPDATE/DELETE
protection. Unit tests also retain archived INSERT service guards and stale-state refresh
coverage. Raw SQL INSERT into archived child tables remains outside the DB trigger boundary
by design; supported service writes enforce the archived-vault restriction.

## Isolation and remaining limits

All SQL tests used randomly named LegacyVault_LegalTest_, LegacyVault_V30Trigger_ or
LegacyVault_HandoverUpgrade_ databases. Fixtures restrict cleanup to their generated names.
A final read-only sys.databases check found no databases with these prefixes remaining.
No application/shared DB was migrated or altered. Existing DBs with the old applied V25
checksum still require a separate, explicitly approved operational plan; this run does not
certify or repair them.

Ignored logs: backend/ps67-72-v25-regression.log, ps67-72-v25-upgrade.log,
ps67-72-v25-sql.log and ps67-72-v25-sql-summary.log. git diff --check passed.
No push, merge, new branch/PR, Jira transition or teammate message was performed.
