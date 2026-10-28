# Staff–Legal workflow and in-app notifications — 28/10/2026

This contract implements the user's confirmed workflow: valid notarized distribution documents are accepted, alongside the existing court-document branch. It supersedes the COURT-only and optional-will rules in court-only.md. It does not replace current-version/hash/allocation checks, case ownership, explicit Legal approval or separate unlocking.

## Workflow

1. Assigned Staff records death documents and the original paper will, attaching scans in the verification case.
2. Staff uploads distribution documents and allocations. A missing basis dossier is created as intake, not as a Legal classification or approval: classifiedBy is null. Supported types remain NOTARIAL_PARTITION, COURT_JUDGMENT and COURT_DECISION.
3. The frontend uploads and forwards the exact received version in one user operation. These remain two server transactions. If forwarding fails after upload, the UI preserves the saved receipt and offers retry-forward without uploading another version. It never reports transfer success on a partial failure.
4. Early intake/forward is allowed in AWAITING_VERIFICATION, DOCUMENT_VERIFICATION and WILL_VERIFICATION as well as AWAITING_LEGAL_BASIS. It does not skip Legal's gates. Death approval precedes will comparison; the latest will comparison must be MATCH before distribution review/approval/unlock. Forwarded distribution documents become ready for review once that comparison succeeds.
5. Legal has five navigation steps: death verification, will comparison, basis assessment, final approval and unlock. Basis assessment displays document metadata, scans and allocations, and supports requesting supplementation with a required reason. The old /legal/dossier-review URL remains an alias to basis assessment; it is not a sixth navigation step. ON_HOLD reclassification remains available in the same assessment workspace.
6. Supplementation returns the dossier to Staff. Staff supplies and forwards a new required version; Legal reviews its actual current snapshot. Final APPROVE and REJECT both require a nonblank reason of at most 1000 characters. Approval does not unlock automatically.
7. Notarial clearance requires a forwarded file with issue metadata, notary office, notarial document number, a nonfuture notarization date and no unresolved dispute. It does not fabricate a court decision. The court branch retains its valid-court-decision prerequisite. Both branches require a fresh review and current approval for the actual version/hash/allocation/dispute snapshot before unlock/handover.

## Notifications

Migration V54 adds workflow_notifications and workflow_notification_reads. No prior migration is edited. Notifications are generated synchronously from successful audited workflow mutations in the same transaction. Failure to persist an expected notification fails the operation rather than returning a misleading success. Automatic revalidation notices are suppressed when a document-upload/forward notice already represents the change; explicit supplementation requests retain their reason.

GET /api/v1/workflow-notifications?workspace=LEGAL|STAFF returns the latest 50 visible items:

    [{id, caseId, caseNumber, action, reason, occurredAt, read}]

- LEGAL requires LEGAL_VERIFIER and uses the existing Legal case-read scope.
- STAFF requires STAFF_EXECUTOR and sees assigned cases, plus unassigned OPEN cases consistent with the existing queue. Reassignment is checked on every list/read acknowledgement.
- ADMIN, VAULT_OWNER and BENEFICIARY alone cannot access either workspace. A role cannot select the other workspace to enlarge access.
- Responses are no-store. No raw audit context, file contents, credentials, owner contact details or internal database IDs are returned. Reasons are plain text visible only within the permitted case scope.

PUT /api/v1/workflow-notifications/{id}/read?workspace=LEGAL|STAFF returns HTTP 200 with {id,read:true}. Acknowledgement is per user, idempotent, and repeats the case-scope check; missing/out-of-scope IDs return 404.

The shared Staff/Legal header has an inbox and unread indicator. It reloads every 15 seconds while visible and after local workflow changes, aborts requests on token/workspace change, and links to the case and relevant task. After a successful action, a compact inline status confirms the outcome and that the other team has been notified. This means a persisted in-app notification, not an email-delivery or read receipt. No success is shown while the request is pending or after failure.

## Validation

- Component/service tests cover the real Legal workflow, notifications, cancellation, stale data, cross-case responses, forwarding partial failure, approval reasons, retained read-only history and the existing evidence viewer.
- Backend tests cover notarial metadata/file prerequisites, will sequence, role restrictions and notification persistence failure.
- WorkflowNotificationLocalSqlTest is an explicit opt-in test (LEGACY_WORKFLOW_LOCAL_SQL_TEST=true) against local LegacyVault. Fixture users/vault/case/audit/notification/read rows are transactional and roll back. It verifies persistence and per-user/per-case visibility without claiming browser E2E acceptance or signing a JWT.
- The isolated SQL suites that create databases still require LEGAL_SQLSERVER_MASTER_URL. Local rollback checks do not replace those suites or a complete multi-role browser handover acceptance run.
