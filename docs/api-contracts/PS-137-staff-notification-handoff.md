# PS-137 Staff FE notification handoff

Staff mutation receipts are validated by existing case/document/version services. Success refreshes the shared inbox via `lv-workflow-notifications-changed`. Only a valid `notification.id`, workspace LEGAL and status RECORDED produces a recorded notice. Missing/malformed/wrong-workspace receipt remains explicit "notification not confirmed", separate from business success. No notification POST endpoint or local inbox entries are invented.

Shared inbox remains owned by PS-136: Staff maps intake events to case intake, distribution document acceptance and allocation corrections to the allocations tab; mark-read and navigation require server acknowledgement. Current account/token changes abort stale reads. Server errors are not empty inboxes.

## Remaining BE work / PS-135 (Ân)

The current PS-135 contract lists attachment, review/hold/rereview hooks and complete inbox security/SQL verification as pending. Implement notifications and mutation receipts for the remaining matrix; do not infer sent/read from RECORDED. Use existing persisted notification event source, current assigned Staff authorization and transaction rollback semantics. No new email/SMS/WebSocket scope.

Acceptance: Staff → Legal after document/attachment/forward/allocation, Legal → assigned Staff after request/supplementation/assessment/decision/unlock; no duplicate event on idempotent replay; inaccessible after assignment/account changes; read state persists per account; audit/notification failure rolls back business transaction. Supply safe contract fixtures and run actual two-account FE → BE → SQL acceptance before Jira Done. The FE can test contract-shaped receipts without claiming this runtime proof.
