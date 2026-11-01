# PS-124 FE handoff → PS-122 (Dương)

Status: FE view model / proposed adapter, NOT an approved HTTP endpoint. User requested FE-first with isolated test mocks; BE work remains assigned separately. Do not expose the Staff/Legal group DTO to Beneficiary.

## BE work to deliver

Extend the authorized shared-case read flow or publish its final endpoint in PS-122. Return only current-account scopes, including linked cases with zero delivered items (received-assets alone cannot provide those). Derive access from authenticated principal and current recipient links, never a caller-supplied user ID. Archived delivered content remains accessible according to existing policy.

Adapter output expected by FE `caseLinkActions.loadHandoverStatus(options)`:

```json
{"subjectId":"authenticated account UUID","cases":[{"caseId":"authorized case UUID","caseNumber":"HS-2026-000001","status":"SUSPENDED","totalAssets":2,"deliveredAssets":0}]}
```

`status`: UNCONFIRMED / SUSPENDED / AWAITING_LEGAL / READY, derived from the same case-wide group event source as PS-119/120. READY never means DELIVERED. Counts refer only to the caller's own approved allocations and real delivery records, never shrink the denominator due to absence. No attendance IDs, other recipient identities/counts, staff/legal internal reason, snapshot/hash or actor metadata in this response.

## Acceptance and verification

- Auth required; enforce active/current account and recipient linkage on every read. Cross-account/case and reassignment cannot leak stale data. Distinguish unavailable/access/error from an empty authorized list.
- Cases before and after suspension/request/Legal decision/delivery/archive show correct state. GET does not mutate events or rights.
- Transactionally consistent state/counts; no false completion. No content until DELIVERED under existing item-level authorization.
- Supply final HTTP/error schema, OpenAPI and safe fixtures; FE adapter maps that contract to the view model. No FE endpoint has been invented.
- Test role/IDOR/privacy, zero deliveries, revoked linkage, history and source-state concurrency with SQL Server; then two-account browser acceptance.

FE component is ready to accept this adapter, aborts reads on scope changes, validates subject/counts/statuses, supports refresh/VI/EN/mobile. Mock is only permitted with DEV preview and no real access token; live sessions show an honest unavailable state until BE is integrated. This is not a completed end-to-end PS-124 implementation.
