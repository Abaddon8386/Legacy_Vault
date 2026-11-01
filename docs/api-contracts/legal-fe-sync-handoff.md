# Legal FE alignment after PRs #240–245

Frontend changes preserve Legal hold drafts through context refresh, pause background workflow reads during Legal writes, and distinguish business success from recorded or unconfirmed Staff notification receipts. Existing approval/unlock/hold APIs and policy are unchanged.

## Group handover: remaining Legal discovery contract

PS-119/120 already exposes Legal GET group-handover and POST reopening decision for a known case/session/request. PR #241 now gives Staff the attendance and reopening-request UI. However, the current Legal queue/context does not return handover sessions or pending reopening requests; there is no authorized Legal session-list endpoint. The current group view also omits the Staff request reason/time. FE must not use Staff-only session endpoints, ask Legal to enter internal UUIDs, or infer a pending request from distribution phase.

BE owner for PS-121: publish an authorized Legal discovery/read contract (extend context or supply a documented endpoint) containing current case/session/request identity, request reason/time, revision and current all-present/snapshot eligibility. It must exclude obsolete/replaced requests and enforce current assignment/session/document/allocation/approval scope. Keep decision writes on the existing PS-120 endpoint with reason and Idempotency-Key; approval only restores the group READY state and never unlocks or delivers assets.

Supply OpenAPI and fixtures for pending/replaced/ended-session/denied requests. Then Legal can show a named request list and approve/reject with a reason, without manual identifier entry. Verify Staff request → Legal decision → Staff refresh using two real accounts before claiming this round trip is complete.

## Notification receipts

Hold/reclassification/review and group decision responses may still have null notification receipts. Implement the remaining PS-135 hooks transactionally and return the documented recipient-scoped receipt. FE shows an unconfirmed-notification notice until that evidence exists; it does not send a separate notification POST or manufacture an inbox entry.
