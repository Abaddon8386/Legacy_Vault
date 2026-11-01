# PS-135 / PS-138 backend follow-up (2026-11-01)

This patch starts from `develop` 668592a. Notification receipts mean `RECORDED` in the
business transaction only. They do not assert delivery, display, read, or email.

| Successful action | Recipient | Action / event key | Snapshot and opening target | Receipt |
| --- | --- | --- | --- | --- |
| Staff uploads a death or original-will attachment | Legal workspace | `INTAKE_ATTACHMENT_UPLOADED` / `attachment:<attachment public id>` | Case id in receipt; attachment metadata has subject id and SHA-256. Open the Legal case. | In upload response |
| Staff records group attendance | Legal workspace | `HANDOVER_GROUP_ATTENDANCE` / `group:<event public id>` | Group revision and snapshot in mutation response. Open the Legal case and handover session. | In mutation response |
| Staff requests handover reopening | Legal workspace | `HANDOVER_GROUP_REQUEST` / `group:<event public id>` | Group revision and snapshot in mutation response. Open the Legal case and handover session. | In mutation response |
| Legal approves or rejects reopening | Assigned Staff | `HANDOVER_GROUP_APPROVE` or `HANDOVER_GROUP_REJECT` / `group:<event public id>` | Group revision and snapshot in mutation response. Open the Staff case and handover session. | In mutation response, null without assigned Staff |
| Legal places the basis dossier on hold | Assigned Staff | `LEGAL_BASIS_HELD` / `basis-hold:<dossier public id>:<required version>` | Required version and current dossier state in mutation response. Open the Staff case. | In mutation response, null without assigned Staff |

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
Review/rereview/resume hooks, inbox action labels for the new group/attachment events,
and complete HTTP/SQL evidence remain outstanding for PS-135.
