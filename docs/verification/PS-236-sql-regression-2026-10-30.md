# PR #236 SQL regression verification — 2026-10-30

Tested commit: 666cc97020cfccecb8cdbd6c2b6c661d769c36ee.
Branch: feature/PS-119-120-group-handover. No runtime/test code change was needed in this run.

## Environment and safety

SQL Server default instance MSSQLSERVER was running; TCP localhost:1433 accepted connections.
Product version: 17.0.1000.7. Windows integrated authentication succeeded.
No persisted DB_URL or LEGAL_SQLSERVER_MASTER_URL was required: supplied master URL only to
the Maven process and used the installed mssql-jdbc_auth 13.6.0.x64 native library through
Surefire argLine. No credentials or machine configuration were committed/changed.

The existing LegalBasisSqlServerSupport harness created a fresh database named
LegacyVault_LegalTest_<random UUID> per test class and dropped it in teardown.
V57 ran in these disposable databases. No application/shared database was migrated or reset.
After all test classes finished, a read-only sys.databases query found ZERO databases
matching LegacyVault_LegalTest_<UUID>. Migration names remain distinct from PS-116's V56.

## Result

Maven returned exit code 0. 55 tests executed, 55 passed, 0 failures, 0 errors, 0 skipped.
This covers the complete 52-test handover regression group referenced by the team review
(including the previously reported 28 failures), plus 3 new group-handover SQL tests.

Executed classes and counts:
- AssetCompletionSqlServerTest: 1
- BeneficiaryCompletionSqlServerTest: 2
- BeneficiaryReconciliationSqlServerTest: 6
- CourtRecipientsHttpSqlServerTest: 1
- FinalCourtHandoverHttpSqlServerTest: 1
- HandoverArchiveSqlServerTest: 4
- HandoverCloseSqlServerTest: 4
- HandoverCompletionSqlServerTest: 1
- LegalReadSqlServerTest: 17
- ReceivedAssetSqlServerTest: 4
- SignedReceiptSqlServerTest: 2
- StaffCounterInvitationSqlServerTest: 9
- GroupHandoverSqlServerTest: 3

The SQL group tests now actually exercise V57 schema creation/transaction rollback,
duplicate retry-key constraint and real shared-fixture suspension -> complete attendance ->
Staff request -> Legal approval -> delivery. HTTP court tests and historical reads/archive
also passed on the real SQL database. This verifies the fixture changes from 666cc97;
the production gate was not disabled or weakened.

Reproduction: set LEGAL_SQLSERVER_MASTER_URL to
jdbc:sqlserver://localhost:1433;databaseName=master;encrypt=true;trustServerCertificate=true;integratedSecurity=true
in the test process only. Run mvn test with -Dtest set to the classes above, and
-DargLine=-Djava.library.path=<installed mssql-jdbc_auth directory>.
Use the existing disposable database harness; never point its master-URL variable at an app DB.

## Remaining limits

The previous claim that these SQL regressions were NOT VERIFIED is superseded by this run.
NOT VERIFIED: simultaneous multi-thread delivery/suspend/reopen races, forced audit failure
inside the real group mutation transaction, persisted-state recovery after process restart,
browser FE E2E and the team's separate 1109-test full baseline. These tests do not prove
deadlock freedom or production readiness. PR stays draft pending remaining acceptance/review.
