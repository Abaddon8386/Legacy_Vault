# A2 — PS-138 rejected dossier regression (2026-11-04)

Scope: the A2 assignment adds SQL regression tests for rejection, supplementation
and reapproval, and records the existing PS-119 AC7 policy on Jira. A1 is the
prerequisite branch `codex/a1-ps135-138-develop` (HEAD `9883872`).
Tested A2 source commit: `494f0ae`.

## Completed checks

Three new tests in `DistributionWorkflowSqlServerTest` passed on real SQL Server:

- `finalRejectionBlocksFurtherStepsUntilSupplementationIsRequested`: REJECTED,
  current Staff decision/snapshot/reason, rejected allocations, persisted decision
  notification, and blocked upload/allocation/final approval/unlock.
- `supplementationFromRejectionValidatesBeforeWritingAndReturnsTheCaseToStaff`:
  blank reason and stale revision/version/hash cause no state/history/event/audit/
  notification writes; a valid request reopens intake with one review notification.
- `supplementedNewVersionMustBeReviewedAgainBeforeFinalApprovalAndUnlock`: corrected
  version 2, forwarding, document/allocation review, stale version-1 rejection,
  final approval, separate unlock, distinct decision notification and preserved history.

These cover the assigned PS-138 AC5 rejection → supplementation → reapproval path.
PS-138 AC1/2 current decision/snapshot and AC3/4 phase/capability checks are exercised
within that path. They do not claim exhaustive race, IDOR or reassignment coverage.
No production code, schema, fixtures, permissions or migrations were changed by A2.

## Final regression

107 tests passed; zero failures, errors or skipped tests. Java 25, Maven, SQL Server
17.0.1000.7 on localhost:1433, Windows integrated authentication.

- Unit/controller/service: WorkflowNotificationServiceTest 8,
  BasisDossierViewServiceTest 4, BasisReclassificationServiceTest 9,
  DistributionReplacementWorkflowTest 4, LegalApprovalGuardTest 5,
  LegalApprovalServiceTest 7, LegalBasisDossierControllerTest 17,
  LegalBasisReviewServiceTest 16 (70 total).
- Real SQL: DistributionWorkflowSqlServerTest 13, LegalHoldSqlServerTest 12,
  LegalNotarialSqlServerTest 6, LegalReviewSnapshotSqlServerTest 6 (37 total).

Reproduction from the A2 worktree:

```powershell
$env:LEGAL_SQLSERVER_MASTER_URL = 'jdbc:sqlserver://localhost:1433;databaseName=master;encrypt=true;trustServerCertificate=true;integratedSecurity=true;'
mvn -B '-Dtest=LegalBasisReviewServiceTest,BasisReclassificationServiceTest,LegalBasisDossierControllerTest,DistributionReplacementWorkflowTest,WorkflowNotificationServiceTest,LegalApprovalServiceTest,LegalApprovalGuardTest,BasisDossierViewServiceTest,DistributionWorkflowSqlServerTest,LegalReviewSnapshotSqlServerTest,LegalHoldSqlServerTest,LegalNotarialSqlServerTest' '-DargLine=-Djava.library.path=<installed mssql-jdbc_auth 13.6.0.x64 directory>' test -f backend/pom.xml
```

The existing harness created/migrated/dropped a fresh
`LegacyVault_LegalTest_<UUID>` per SQL class. Database inventories before and after
matched; zero matching temporary databases remained. Existing application databases
were not migrated, reset or used for fixture writes. Configuration was process-local.
Local build evidence (untracked): `backend/target/a2-regression.log`,
`a2-regression-databases-before.txt`, `a2-regression-databases-after.txt`.

## PS-119 AC7

Decision recorded in [PS-119 comment 10037](https://thaithai9785.atlassian.net/browse/PS-119?focusedCommentId=10037):
only direct beneficiaries count as present. Guardian/representative, account links
and login do not replace direct presence. This records the policy already published
in `docs/api-contracts/PS-119-120-group-handover.md`; it introduces no new policy.

## Handoff limits

The assigned A1/A2 implementation, contract, three new tests and Jira decision work
are complete. Peer review and merging remain team actions. Full backend suite,
browser two-account FE E2E and exhaustive read/reassignment/race cases were not run.
Do not mark all of PS-135/PS-138 Done solely from this scoped assignment.
