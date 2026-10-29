# PS-134: persisted Staff–Legal notifications (initial implementation)

GET /api/v1/workflow-notifications?workspace=STAFF|LEGAL returns HTTP 200,
up to 50 newest items: {id, caseId, caseNumber, action, reason, occurredAt, read}.
PUT /api/v1/workflow-notifications/{id}/read?workspace=STAFF|LEGAL returns
HTTP 200 {id, read:true}. Both responses have Cache-Control: no-store.
Roles: STAFF_EXECUTOR for STAFF; LEGAL_VERIFIER for LEGAL. Authentication is required.
Staff visibility requires both the recorded recipient and the current case assignment.
Legal visibility follows the existing Legal workspace, which can access all cases.
Read state is separate per account. Unknown/out-of-scope read updates return 404.

V55 creates dedicated notifications and read receipts. No audit context is exposed.
Recording joins the business transaction (MANDATORY); storage errors propagate.
Case locking and a unique case/event key serialize duplicate event recording.
RECORDED means database persistence inside the current transaction, not delivery or reading.
No existing business response claims notification delivery; receipt wiring remains pending.

Implemented hooks:
- DEATH_DOCUMENT_RECORDED: Staff -> Legal, keyed by persisted record UUID.
- ORIGINAL_WILL_RECEIVED: Staff -> Legal, keyed by persisted intake UUID.
- LEGAL_DEATH_DOCUMENT_DECIDED: Legal -> assigned Staff; shares the existing public decision reason.
- LEGAL_VAULT_UNLOCKED: Legal -> assigned Staff, keyed by case UUID.
An unassigned case does not produce a Staff notification or RECORDED receipt.

Outstanding before PS-134 can be marked complete:
- Hook attachment upload, basis intake/forward/review, will comparison and final approval/rejection.
- Connect the distribution-workflow actions now available from develop (PR #227).
- Add notification receipts to the existing mutation DTOs and confirm FE #226 action handling.
- Exercise HTTP role checks, multi-account read state, concurrent retry and transaction rollback
  against real SQL Server and the FE. Unit mocks do not establish these properties end-to-end.
- Publish the full OpenAPI definitions alongside the completed receipt integration.

Local environment: localhost:1433, SQLEXPRESS and MSSQLLocalDB were unreachable.
V55 has not been applied to a real SQL Server. No application/shared database was changed.
This is a partial implementation and must remain a draft PR.

Develop compatibility: merged develop 62618ba; V54 distribution events and V55 notifications have distinct versions. Business notification integration remains partial as listed above.
Validation after merging develop: Maven clean test excluding *SqlServerTest and LegacyvaultBackendApplicationTests completed successfully: 748 total, 745 passed, 3 skipped, 0 failures/errors. SQL Server execution remains unverified.
