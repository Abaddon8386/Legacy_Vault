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
