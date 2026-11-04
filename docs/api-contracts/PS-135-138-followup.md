# PS-135 / PS-138 backend follow-up (2026-11-01)

This patch starts from `develop` 668592a. Notification receipts mean `RECORDED` in the
business transaction only. They do not assert delivery, display, read, or email.

| Successful action | Recipient | Action / event key | Snapshot and opening target | Receipt |
| --- | --- | --- | --- | --- |
| Staff uploads a death or original-will attachment | Legal workspace | `INTAKE_ATTACHMENT_UPLOADED` / `attachment:<attachment public id>` | Case id in the request path; attachment metadata has subject id and SHA-256. Open the Legal case. | In upload response |
| Staff records group attendance | Legal workspace | `HANDOVER_GROUP_ATTENDANCE` / `group:<event public id>` | Group revision and snapshot in mutation response. Open the Legal case and handover session. | In mutation response |
| Staff requests handover reopening | Legal workspace | `HANDOVER_GROUP_REQUEST` / `group:<event public id>` | Group revision and snapshot in mutation response. Open the Legal case and handover session. | In mutation response |
| Legal approves or rejects reopening | Assigned Staff | `HANDOVER_GROUP_APPROVE` or `HANDOVER_GROUP_REJECT` / `group:<event public id>` | Group revision and snapshot in mutation response. Open the Staff case and handover session. | In mutation response, null without assigned Staff |
| Legal places the basis dossier on hold | Assigned Staff | `LEGAL_BASIS_HELD` / `basis-hold:<dossier public id>:<required version>` | Required version and current dossier state in mutation response. Open the Staff case. | In mutation response, null without assigned Staff |
| Legal completes review, including a new review of the same snapshot | Assigned Staff | `LEGAL_BASIS_REVIEW_RECORDED` / `basis-review:<persisted review public id>` | Version, document/allocation hashes and dispute status in `LegalBasisReviewResponse`. Open `/staff/legal-documents?caseId=<case id>`. | `LegalBasisReviewResponse.notification`, null without assigned Staff |
| Legal directly requests supplementation | Assigned Staff | `LEGAL_BASIS_REVIEW_REQUIRED` / `basis-review:<persisted review public id>` | Case and dossier identify the request; response preserves the existing review fields. Open `/staff/legal-documents?caseId=<case id>`. | `LegalBasisReviewResponse.notification`, null without assigned Staff |
| Legal resumes an ON_HOLD dossier through reclassification | Assigned Staff | `LEGAL_BASIS_RECLASSIFIED` / `basis-resume:<persisted classification history public id>` | Current route, required version and dossier state in `BasisDossierResponse`. Open `/staff/legal-documents?caseId=<case id>`. | `BasisDossierResponse.notification`, null without assigned Staff |

An idempotency replay of a group mutation reads the existing notification receipt;
it does not create a delayed notification. Failed audit or notification persistence
rolls back the group event. Read state remains per account and reassignment scoped
by the existing inbox service.

`BasisDossierResponse.currentDecision` is nullable. It contains the latest Legal
decision id, status, reason, document version and SHA-256, and allocation SHA-256
only while the current forwarded document and allocation scope still match that
decision. It becomes null for an absent or stale decision, including a newly
uploaded document. Staff access still requires current assignment.

`DistributionWorkflowView.phase` gains `REJECTED` for a matching final rejection.
At that phase Legal may call the existing `request-document-supplementation` action
with the current revision and document snapshot. The existing review transition
then moves the dossier back to intake; Staff upload remains closed until this
explicit request. The existing `LEGAL_BASIS_DECIDED` notification is reused.
Its event key now uses the persisted decision UUID so an independent second
decision on the same document version cannot be collapsed into the first.

The direct `/basis-dossier/review`, `/basis-dossier/request-supplementation`, and
`/basis-dossier/reclassification` services now record their notifications inside the
existing business transaction, after history and audit. Each persisted history row
has its own event key, so independent actions on the same document do not collapse.
Notification failures propagate and roll back the mutation. Assignment scope and
read-state policy are unchanged; no assigned Staff means a null receipt.

The distribution wrapper reuses the service receipt for `approveAllocations` and
`requestDocumentSupplementation`, including null receipts; it does not record a
second distribution notification for those actions. Their inbox actions are now
`LEGAL_BASIS_REVIEW_RECORDED` and `LEGAL_BASIS_REVIEW_REQUIRED`, respectively.
Distribution workflow events and audit actions are preserved. Automatic snapshot
evaluation still returns a null receipt; this fix covers explicit review,
supplementation and resumption mutations.

A1 integration verification (2026-11-04, tested commit `175f991`, based on
`develop` `c923490`; source integration commit `a8420eb`):

- 54 related tests passed: LegalBasisReviewServiceTest (16),
  BasisReclassificationServiceTest (9), LegalBasisDossierControllerTest (17),
  DistributionReplacementWorkflowTest (4), WorkflowNotificationServiceTest (8).
- 34 SQL tests passed on the real local SQL Server: DistributionWorkflowSqlServerTest
  (10), LegalHoldSqlServerTest (12), LegalNotarialSqlServerTest (6),
  LegalReviewSnapshotSqlServerTest (6).
- Both Maven runs returned BUILD SUCCESS: zero failures, errors or skipped tests.
  These results supersede the earlier 50/46-test notes and SQL setup blocker.

The distribution SQL regression now verifies the wrapper notification count and
matching action/receipt on real persistence. The selected SQL suites also exercise
rollback, snapshot invalidation and concurrent workflow/hold transitions. This is
focused coverage, not a claim that every race or rollback path has been tested.
Inbox group labels were fixed separately in commit `ae6715b`.

Reproduction from the A1 worktree (Java 25, Maven):

```powershell
mvn -B '-Dtest=LegalBasisReviewServiceTest,BasisReclassificationServiceTest,LegalBasisDossierControllerTest,DistributionReplacementWorkflowTest,WorkflowNotificationServiceTest' test -f backend/pom.xml
# Set only in the test process; never point this variable at an application database.
$env:LEGAL_SQLSERVER_MASTER_URL = 'jdbc:sqlserver://localhost:1433;databaseName=master;encrypt=true;trustServerCertificate=true;integratedSecurity=true;'
mvn -B '-Dtest=DistributionWorkflowSqlServerTest,LegalReviewSnapshotSqlServerTest,LegalHoldSqlServerTest,LegalNotarialSqlServerTest' '-DargLine=-Djava.library.path=<installed mssql-jdbc_auth 13.6.0.x64 directory>' test -f backend/pom.xml
```

The local instance was MSSQLSERVER, SQL Server version 17.0.1000.7. Windows
integrated authentication succeeded; no credentials or machine configuration were
saved or changed. The harness created and migrated a fresh
`LegacyVault_LegalTest_<random UUID>` database per class and dropped it afterward.
A read-only comparison found the same database inventory before and after, with
zero test databases remaining. No existing application database was migrated,
reset or used for fixture writes. Logs and inventories are local, untracked build
artifacts in `backend/target/`: `a1-task5-tests.log`, `a1-sql-tests.log`,
`a1-sql-databases-before.txt`, `a1-sql-databases-after.txt`.

Remaining: full backend suite, persisted multi-account read/reassignment checks
and browser FE E2E. SQL configuration no longer blocks the selected A1 tests.

OpenAPI cross-check: `LegalBasisReviewResponse.notification` and
`BasisDossierResponse.notification` reference nullable `WorkflowNotificationReceipt`.
`DistributionWorkflowReceipt.notification` has the same nullable fields
`id`, `recipientWorkspace`, `status`; the enclosing workflow receipt carries
`caseId`, requested workflow `action` and `revision`. A notification receipt itself
has no case id or action. The inbox item supplies `caseId` and the notification
action. See [distribution contract](PS-135-distribution-notifications.md) for the
current workflow-to-inbox action mapping and the two delegated event keys.
