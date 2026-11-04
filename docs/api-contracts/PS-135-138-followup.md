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

Verification: Java 25 compile and focused service tests pass. Full Maven test run
is blocked by missing `DB_URL` and `LEGAL_SQLSERVER_MASTER_URL`; SQL concurrency,
rollback, persistent read state, HTTP two-account flow, and FE E2E remain unverified.
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

Historical follow-up verification (before A1 integration): 50 unit/controller tests pass, including HTTP receipt fields,
distinct review event keys, null receipts and propagated notification errors.
The SQL wrapper regression asserts a single persisted notification and matching
receipt, but execution is NOT VERIFIED: `LEGAL_SQLSERVER_MASTER_URL` is absent
(`The url cannot be null`). Real SQL rollback/concurrency and two-account FE E2E
remain unverified. Inbox group labels were fixed separately in commit `ae6715b`.

A1 integration verification (2026-11-04, commit `a8420eb` on `develop` `c923490`):
46 tests passed across LegalBasisReviewServiceTest, BasisReclassificationServiceTest,
LegalBasisDossierControllerTest and DistributionReplacementWorkflowTest. The SQL
workflow test failed at setup with `The url cannot be null` because
`LEGAL_SQLSERVER_MASTER_URL` was absent; it was not skipped or passed.
The original 50-test result above describes an earlier checkout.

OpenAPI cross-check: `LegalBasisReviewResponse.notification` and
`BasisDossierResponse.notification` reference nullable `WorkflowNotificationReceipt`.
`DistributionWorkflowReceipt.notification` has the same nullable fields
`id`, `recipientWorkspace`, `status`; the enclosing workflow receipt carries
`caseId`, requested workflow `action` and `revision`. A notification receipt itself
has no case id or action. The inbox item supplies `caseId` and the notification
action. See [distribution contract](PS-135-distribution-notifications.md) for the
current workflow-to-inbox action mapping and the two delegated event keys.
