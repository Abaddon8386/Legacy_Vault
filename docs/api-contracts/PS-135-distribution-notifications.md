# PS-135 initial distribution contract

Inherited from PS-134 on develop 75ae03f: V55, notification list/read API,
account-specific read state, and four intake/death/unlock hooks.
PS-124 is a separate Beneficiary handover UI ticket (To Do), not notification infrastructure.

This patch connects successful DistributionWorkflowService.perform mutations:
- requestDocuments -> DISTRIBUTION_DOCUMENTS_REQUESTED -> STAFF
- approveDocuments -> DISTRIBUTION_DOCUMENTS_APPROVED -> STAFF
- requestDocumentSupplementation -> DISTRIBUTION_DOCUMENT_SUPPLEMENTATION_REQUESTED -> STAFF
- submitAllocations -> DISTRIBUTION_ALLOCATIONS_SUBMITTED -> LEGAL
- approveAllocations -> DISTRIBUTION_ALLOCATIONS_APPROVED -> STAFF
- requestAllocationChanges -> DISTRIBUTION_ALLOCATION_CHANGES_REQUESTED -> STAFF

eventKey is distribution:<persisted workflow event UUID>. Every independent event has a
different key. Existing revision/snapshot validation rejects stale retries before mutation.
The notification caseId identifies the case to open; document/allocation versions and hashes
remain in the workflow context/events (no document data or audit metadata added to the inbox).
FE should use the existing case/action routing, including the Staff allocation tab for
allocation approval/change feedback.

Mutation receipt retains caseId/action/revision and adds notification:
{id,recipientWorkspace,status:"RECORDED"}, or null if the case has no assigned Staff.
RECORDED only means persistence in the business transaction, not delivery/read/email.
Audit or notification failure aborts that transaction. Phase and permission guards are unchanged.
Internal wrapped review/court calls do not themselves record notifications in this patch;
the outer workflow mutation records one distribution notification.

Remaining PS-135 scope: other missing business hooks, receipt integration for inherited
hooks, full inbox OpenAPI/action enum/fixtures, HTTP authorization tests, SQL concurrency,
rollback/read/reassignment coverage and FE E2E. This patch alone does not complete PS-135.
SQL fixture execution failed before setup: LEGAL_SQLSERVER_MASTER_URL absent (URL cannot
be null). No real SQL Server behavior is verified by the unit tests.

Follow-up patch: inherited four hooks now return notification in their mutation DTOs.
Added WILL_COMPARISON_RECORDED (Staff recipient; will:<comparison UUID>),
LEGAL_BASIS_RECEIVED (Legal; basis:<version UUID>), LEGAL_BASIS_FORWARDED
(Legal; forward:<dossier UUID>:<version>) and LEGAL_BASIS_DECIDED
(Staff; decision:<dossier UUID>:<version>:<decision>) with receipt in their DTOs.
The old DTO constructors remain available; read responses have null notification.
Existing FE WorkflowNotifications action labels/routing accept these action names.
RECORDED does not claim that the UI has received/read the event.

Remaining: attachment and review/hold/rereview hooks, full inbox contract/fixtures,
HTTP/security and SQL/E2E verification. PS-135 remains partial.
SQL database safety check: migration versions are unique; no migration was changed.
Existing SQL test DB name is LegacyVault_LegalTest_<random UUID>, so parallel runs
do not target the application DB or reuse a fixed test DB name. The fixture accepts
only a master connection via LEGAL_SQLSERVER_MASTER_URL. No DB rename/reset was done.