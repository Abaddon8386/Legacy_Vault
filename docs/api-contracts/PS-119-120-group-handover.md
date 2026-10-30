# PS-119/120 — whole-group handover

Implemented on develop 75ae03f; see PS-119-120-group-handover.openapi.json.
Supersedes the obsolete per-allocation/time-based retention proposal in the separate old checkout.
This is independent of the pending PS-135 branch and does not modify applied migrations.

## Confirmed policy

Only direct beneficiaries count as present. Guardian/representative/account/login status does not
replace direct presence. Required recipients include every approved allocation, including delivered
history; neither selecting assets nor filtering verified recipients shrinks this set.
Staff attendance is an assertion about counter conditions, not independent electronic verification.
Session/assignment/document/allocation/approval changes invalidate attendance. Every new report
replaces the prior current report and invalidates a pending request. Historical events remain.

## Implemented API and state

Staff POST .../group-handover/attendance takes expectedRevision, presentRecipientIds, reason.
Missing anyone suspends the entire case in the same transaction as the report and audit.
All-present changes UNCONFIRMED to READY, but never clears SUSPENDED/AWAITING_LEGAL.
Staff POST .../group-handover/reopen-requests takes expectedRevision and reason; requires
a current all-present report while SUSPENDED. The returned state.requestId is the event UUID.
Legal POST .../reopen-requests/{requestId}/decision takes expectedRevision, APPROVE/REJECT, reason.
Only a current pending Staff request with unchanged all-present snapshot may be decided.
APPROVE restores READY; REJECT leaves SUSPENDED. Decisions never set UNLOCKED/DELIVERED/close/archive.
Both workspaces have GET .../group-handover for current state, required IDs and computed allowed flag.
Prefix: /api/v1/staff or /api/v1/legal-verifications, followed by
/verification-cases/{caseId}/handover-sessions/{sessionId}. Every response is no-store.

All POSTs require UUID Idempotency-Key. Receipt: caseId/sessionId/eventId/state/notification.
notification is null until a real PS-135 integration records it; no notification delivery is claimed.
Same assigned actor/case/key with same canonical payload returns the original receipt;
different payload returns GROUP_HANDOVER_STALE. Recheck current role/scope and base legal gates
before replay. New keys require expectedRevision to match current state. Body actor/time is ignored;
server derives actor/time/scope. Reasons are nonblank and at most 1000 characters.
Unknown/wrong assignment/session returns 404; role mismatch 403; unauthenticated 401.
GROUP_HANDOVER_BLOCKED and GROUP_HANDOVER_STALE are structured 409 ApiError codes.
Bad fields or recipients outside the current direct-beneficiary set return 400.

## Persistence, concurrency and integration

V57 handover_group_events is append-only. Latest case revision is the current gate state;
events retain original state/request, present-recipient IDs, actor/time/reason and retry fingerprint.
Unique(case,revision) and unique(case,actor,key) are final database constraints.
No legal ON_HOLD/vault status change, no per-allocation holds, no scheduler.
Existing Vault -> case -> dossier -> session locks serialize report, request, decision and delivery;
the case lock also serializes event revision and retry lookup/insert. Audit errors propagate and
must rollback the same transaction. Snapshot hash includes session, assignment, dossier version,
document hash, full allocation hash and latest legal decision UUID.

Runtime gate is in delivery, signed/ordinary beneficiary confirmation, receipt creation, close
and archive writes. Old clients without current attendance receive 409. Read/history paths are
not gated by the new attendance requirement; archived idempotent archive replay remains historical.
A new session cannot clear case-wide suspension. Existing legal approval/account/identity gates
are still required; group approval only removes this group's block.
PS-121/122 must reuse this case event source/contract instead of creating competing state tables.
This minimal API records the attendance required to make PS-120 executable ahead of their UI/read work.

## Verification and remaining review

Unit state/service and HTTP role tests plus existing handover regression tests are provided.
SQL fixture uses a randomly named LegacyVault_LegalTest_<UUID> database and requires a master URL;
schema constraints/rollback tests are conditional and do not target the application database.
Real SQL migration, concurrent races, process restart and complete FE E2E remain NOT VERIFIED
without a reachable SQL Server. Mocks prove neither database atomicity nor deadlock freedom.
Core representative and freshness decisions were confirmed by the user on 30/10/2026.
Technical failure does not imply absence: transaction rollback leaves no new state; a previously
committed delivery is retained. No new policy automatically reverses or retries completed delivery.
PS-119 design review and PS-120 SQL/E2E acceptance still require team review before marking Done.
