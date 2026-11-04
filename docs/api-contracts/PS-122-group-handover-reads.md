# PS-122 — read contract for the whole-group handover

Status: **implemented on `develop`** (read endpoints and richer detail, additive to PS-119/120/121). Endpoint and field names are kept exactly as implemented: the team plan of 02/11/2026 answers "giữ nguyên" because the Staff FE and PR #260 already call them; anyone who disagrees comments on that line of the plan. Nothing here changes a write path (PS-120), the delivery gate (PS-121), approval/unlock rules or the PS-119/120 contract; every addition is read-only and additive. Machine-readable shapes: `PS-119-120-group-handover.openapi.json`; example bodies: `fixtures/PS-122-group-handover-reads.json`.

Business rule (Thái, 30/10/2026): see `PS-119-120-group-handover.md`. READY never means DELIVERED. Absent people and undelivered assets never leave a denominator. A GET never changes a lock, a right or a decision. Distinguish the legal `ON_HOLD` from this case-wide suspension (`SUSPENDED`).

All responses are `Cache-Control: no-store`. Auth/role errors use the normal ApiError envelope: unauthenticated 401, wrong role 403, unknown/unassigned case or session 404, bad paging/filter 400 `VALIDATION_FAILED`.

## 1. Existing detail, now richer (Staff and Legal)

`GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover`
`GET /api/v1/legal-verifications/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover`

Previously returned `state`, `snapshot`, `requiredRecipientIds`, `deliveryAllowed` (unchanged). Added fields (all additive; old clients keep working):

| Field | Meaning |
|---|---|
| `caseId`, `caseNumber`, `sessionId`, `sessionStatus` | Which case/session this is |
| `progress.totalAssets / deliveredAssets` | Approved asset lines and those with a real delivery record; absence never shrinks them |
| `progress.requiredRecipients / presentRecipients` | Everyone in the approved scope and how many of them the current report names |
| `attendance` | Current report: `attendanceId`, `recordedAt`, `recordedBy{userId,fullName}`, `presentRecipientIds`, `reason`; `null` before the first report |
| `request` | Only while `AWAITING_LEGAL`: `requestId`, `requestedAt`, `requestedBy`, `reason` |
| `lastDecision` | Latest Legal decision for the case: `eventId`, `result` (`APPROVE`/`REJECT`), `decidedAt`, `decidedBy`, `reason`; kept after the decision |
| `capabilities.canRecordAttendance` | Staff view only, session open |
| `capabilities.canRequestReopen` | Staff view only: `SUSPENDED`, everyone present, report still current |
| `capabilities.canDecide` | Legal view only: `AWAITING_LEGAL`, matching `requestId`, report still current |
| `capabilities.deliveryBlockedReason` | `null` when delivery is allowed, else `ATTENDANCE_REQUIRED`, `MISSING_RECIPIENTS`, `LEGAL_REOPEN_REQUIRED`, `AWAITING_LEGAL_DECISION`, `ATTENDANCE_STALE`, or `BLOCKED` (the gate refuses although the report is current) |

The detail read needs the same open session as the writes (assigned Staff, or Legal workspace access): an ended session is refused with 409 `HANDOVER_SESSION_INVALID_STATE`, and a case, session or assignee outside scope with 404. After the session ends, use the history endpoint (section 3) or the recipient status (section 4).

Capabilities only help the UI; every write re-checks on the backend. The read takes the same locks as the writes so state, counts and snapshot are one consistent picture; it still writes nothing.

## 2. Legal: pending reopen requests (priority 1)

`GET /api/v1/legal-verifications/group-handover/reopen-requests?caseId=&caseNumber=&page=0&size=20` (role `LEGAL_VERIFIER`)

- `caseId` (UUID) and `caseNumber` (`HS-yyyy-nnnnnn`, case-insensitive) narrow the list; `size` 1..100, default 20; oldest request first.
- Page envelope: `content`, `page`, `size`, `totalElements`, `totalPages`.
- An item is **only** a request Legal can decide right now. It is dropped when the request was replaced by a newer report, already decided, the session ended, the Staff assignment changed, the document/allocation/approval scope changed, or anything else the decision itself would refuse. Each case is re-checked with the decision path's own gate in a separate short transaction, so the list cannot promise what the decision would then reject and never holds several case locks at once.
- Item: `requestId`, `caseId`, `caseNumber`, `sessionId`, `vaultName`, `requestedAt`, `requestedBy{userId,fullName}`, `reason`, `revision`, `allPresent`, `requiredRecipients`, `presentRecipients`, `totalAssets`, `deliveredAssets`, `decidable` (always `true` here). No hash, snapshot or internal id.
- To decide, Legal uses the unchanged PS-120 endpoint with `requestId`, `revision` (as `expectedRevision`), a reason and an `Idempotency-Key`. Approving only restores `READY` for the group; it never unlocks, delivers, closes or archives.

## 3. History (Staff and Legal)

`GET .../handover-sessions/{sessionId}/group-handover/events?page=0&size=20` under `/api/v1/staff/verification-cases/{caseId}` (assigned Staff and the session owner) or `/api/v1/legal-verifications/verification-cases/{caseId}` (Legal).

Newest first. Item: `eventId`, `sessionId`, `operation` (`ATTENDANCE`/`REQUEST`/`APPROVE`/`REJECT`), `revision`, `resultingStatus`, `allPresent`, `presentRecipients`, `reason`, `at`, `by{userId,fullName}`. Stays readable after the session ends or the case is archived. A Staff who is not the assigned owner gets 404.

## 4. Recipient: private status (PS-124 blocker)

`GET /api/v1/beneficiary-handover-status` (role `BENEFICIARY`). The account comes only from the authenticated principal; there is no account/user/case parameter.

```json
{"subjectId":"authenticated account UUID","cases":[{"caseId":"…","caseNumber":"HS-2026-000001","status":"SUSPENDED","totalAssets":2,"deliveredAssets":0}]}
```

- Exactly the shape the FE adapter `caseLinkActions.loadHandoverStatus` expects (see `PS-124-beneficiary-handover-fe-handoff.md`); five fields per case, nothing else.
- Only cases where the account is **currently** a linked recipient with approved allocations. A linked case with zero deliveries is returned. A revoked link, a deleted/inactive account or another account yields nothing at once.
- `status` is the case-wide group status from the same event source: `UNCONFIRMED`, `SUSPENDED`, `AWAITING_LEGAL`, `READY`. For an open case, a stored `READY` is shown as `UNCONFIRMED` when the attendance no longer matches the current approved scope or there is no open session, so the read and the delivery gate never disagree. `READY` is not `DELIVERED`.
- `totalAssets`/`deliveredAssets` count only this account's approved lines and real delivery records; nobody else's, and absence never shrinks the total.
- Never returned: other recipients' identities, counts or presence, attendance ids, Staff/Legal reasons, snapshot/hash, actor data. The Staff/Legal DTO is not reused.
- Content is still readable only for delivered items under the existing received-assets policy, including after archive.

## Fixtures and evidence

Safe example bodies (synthetic ids only) are in `fixtures/PS-122-group-handover-reads.json`. The SQL tests are `GroupHandoverReadsSqlServerTest` (reads) and `GroupHandoverGateSqlServerTest`, `GroupHandoverReopenSqlServerTest`, `GroupHandoverConcurrencySqlServerTest` (PS-125). AC-to-test evidence is in `docs/verification/PS-122-group-handover-reads-evidence.md` and `docs/verification/PS-125-group-handover-integration-evidence.md`.

## Not decided here

- Retention/paging limits of the history are the generic ones (max 100 per page); no retention policy was invented.
- The Legal list is filtered after the per-case gate check, so `totalElements` is the number of requests that are decidable now; pending requests are naturally few (at most one per open case).
- Notification receipts: the group mutations (PS-120) return a real receipt (`{id, recipientWorkspace, status: "RECORDED"}`), see `PS-119-120-group-handover.md`. The read endpoints in this document create no notification and return none.
