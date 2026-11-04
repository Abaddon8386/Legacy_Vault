# PS-135 distribution notification contract

Current contract after cherry-picking `e41c5db` onto `develop` `c923490`
(local integration commit `a8420eb`). See [backend follow-up](PS-135-138-followup.md)
and [OpenAPI](openapi.yaml) for the related hooks and response schemas.

Inherited from PS-134 on develop 75ae03f: V55, notification list/read API,
account-specific read state, and four intake/death/unlock hooks.
PS-124 is a separate Beneficiary handover UI ticket, not notification infrastructure.

This patch connects successful DistributionWorkflowService.perform mutations:

- requestDocuments -> DISTRIBUTION_DOCUMENTS_REQUESTED -> STAFF
- approveDocuments -> DISTRIBUTION_DOCUMENTS_APPROVED -> STAFF
- requestDocumentSupplementation -> LEGAL_BASIS_REVIEW_REQUIRED -> STAFF
- submitAllocations -> DISTRIBUTION_ALLOCATIONS_SUBMITTED -> LEGAL
- approveAllocations -> LEGAL_BASIS_REVIEW_RECORDED -> STAFF
- requestAllocationChanges -> DISTRIBUTION_ALLOCATION_CHANGES_REQUESTED -> STAFF

For requestDocumentSupplementation and approveAllocations, eventKey is
basis-review:<persisted review history UUID>. The delegated review service records
the notification; the wrapper reuses its receipt, including null, without recording
a second distribution notification. For the other four actions, eventKey is
distribution:<persisted workflow event UUID>. Every independent event has a different key.
Workflow events and audit actions remain unchanged: the two delegated actions still
audit DISTRIBUTION_DOCUMENT_SUPPLEMENTATION_REQUESTED and
DISTRIBUTION_ALLOCATIONS_APPROVED, respectively. These audit names are not their
current inbox notification actions. Existing revision/snapshot validation rejects
stale retries before mutation.
The inbox item caseId identifies the case to open; document/allocation versions and hashes
remain in the workflow context/events (no document data or audit metadata added to the inbox).
FE should use the existing case/action routing, including the Staff allocation tab for
allocation approval/change feedback. In this checkout, LEGAL_BASIS_REVIEW_RECORDED
opens `/staff/legal-documents?caseId=<case id>&tab=allocations`;
LEGAL_BASIS_REVIEW_REQUIRED opens the same case without the allocation tab.
Existing inbox items with the old DISTRIBUTION_* actions remain supported by FE.

Mutation receipt retains caseId/action/revision and adds notification:
{id,recipientWorkspace,status:"RECORDED"}, or null if the case has no assigned Staff.
RECORDED only means persistence in the business transaction, not delivery/read/email.
Audit or notification failure aborts that transaction. Phase and permission guards are unchanged.
Explicit review and supplementation calls record notifications in LegalBasisReviewService,
whether called directly or through the distribution wrapper. Automatic snapshot
evaluation returns a null receipt and does not record a notification.

OpenAPI cross-check: DistributionWorkflowReceipt keeps caseId/action/revision;
action is the requested workflow action (for example approveAllocations), not the
inbox action. Its nullable notification object matches WorkflowNotificationReceipt:
id, recipientWorkspace (STAFF or LEGAL), status (RECORDED). The notification receipt
itself contains neither caseId nor action. LegalBasisReviewResponse.notification
and BasisDossierResponse.notification reference that same nullable receipt schema.

Follow-up patch: inherited four hooks now return notification in their mutation DTOs.
Added WILL_COMPARISON_RECORDED (Staff recipient; will:<comparison UUID>),
LEGAL_BASIS_RECEIVED (Legal; basis:<version UUID>), LEGAL_BASIS_FORWARDED
(Legal; forward:<dossier UUID>:<version>) and LEGAL_BASIS_DECIDED
(Staff; decision:<persisted decision UUID>) with receipt in their DTOs.
The old DTO constructors remain available; read responses have null notification.
Existing FE WorkflowNotifications action labels/routing accept these action names.
RECORDED does not claim that the UI has received/read the event.

The follow-up also connects attachment upload, hold, explicit review/rereview and
resumption through reclassification. Review uses LEGAL_BASIS_REVIEW_RECORDED,
supplementation uses LEGAL_BASIS_REVIEW_REQUIRED (both basis-review:<review UUID>),
and resumption uses LEGAL_BASIS_RECLASSIFIED (basis-resume:<classification history UUID>).
See the follow-up for recipients and response DTOs.

A1 verification on 2026-11-04 (tested commit `175f991`, based on `develop` `c923490`):

- 54 related tests passed: LegalBasisReviewServiceTest (16),
  BasisReclassificationServiceTest (9), LegalBasisDossierControllerTest (17),
  DistributionReplacementWorkflowTest (4), WorkflowNotificationServiceTest (8).
- 34 real SQL Server tests passed: DistributionWorkflowSqlServerTest (10),
  LegalHoldSqlServerTest (12), LegalNotarialSqlServerTest (6),
  LegalReviewSnapshotSqlServerTest (6).
- Both runs completed with zero failures, errors or skipped tests. OpenAPI parsing,
  notification receipt schema checks and `git diff --check` also passed.

The SQL configuration blocker is resolved. SQL Server `localhost:1433` accepted
Windows integrated authentication. The master JDBC URL and installed JDBC native
authentication library were supplied only to the test process, without credentials
or machine configuration changes. The existing harness created a separate
`LegacyVault_LegalTest_<random UUID>` database per class, migrated only those
databases and dropped them in teardown. A read-only before/after inventory matched;
zero matching test databases remained. No existing application database was
migrated, reset or used for fixture writes; no migration source was changed.

Logs are local build artifacts under `backend/target/`: `a1-task5-tests.log`,
`a1-sql-tests.log`, `a1-sql-databases-before.txt`, `a1-sql-databases-after.txt`.
They are not tracked in Git. See the follow-up for the reproduction command.

Remaining verification: the full backend suite, full inbox contract/fixtures,
persisted multi-account read/reassignment behavior and browser FE E2E. The selected
SQL suite covers workflow notification counts/receipts, rollback and concurrency
scenarios; it does not establish all rollback/race cases or production readiness.
Do not infer ticket completion from these focused results.
