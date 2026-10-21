# Admin contract — PS-107 / PS-108 / PS-109

## Permissions and scope

ROLE_ADMIN is required for overview, user administration and audit search. Existing JWT authentication reloads account status/deletion and roles from DB on each protected request. Anonymous/locked/deleted accounts receive 401; authenticated accounts without current ADMIN receive 403 even if the token still claims ADMIN. Counts and reads never grant Staff/Legal/Owner permissions. Responses are DTO whitelists with Cache-Control: no-store. No vault decryption/content, role grants, user creation/editing, audit modification, CSV, uptime or risk classification.

## Implemented: GET /api/v1/admin/overview (PS-107)

No query parameters. Example 200:

```json
{"totalAccounts":12,"activeVaults":7,"processingCases":2,"roleAssignments":{"ROLE_ADMIN":1,"ROLE_VAULT_OWNER":10,"ROLE_BENEFICIARY":4},"startedAt":"2026-10-20T12:00:00Z","completedAt":"2026-10-20T12:00:00.010Z","consistency":"READ_COMMITTED_COLLECTION_WINDOW"}
```

User-approved definitions (20 October 2026): totalAccounts counts users with deleted_at IS NULL, including locked/pending; activeVaults counts every vault whose status is not ARCHIVED (including ON_HOLD/COMPLETED); processingCases counts OPEN cases. These counts are independent: an OPEN legacy case is counted even if its vault is archived. Role assignments count nondeleted users per catalog role, including locked/pending; a multi-role user contributes once to each assigned role. Roles with zero assignments are returned. Sum of assignments need not equal accounts. No joins multiply account/vault/case counts.

SQL Server computes real COUNT_BIG aggregates. startedAt/completedAt are UTC database times around collection at READ COMMITTED. Counts are current observations during this interval, not an atomic cross-table/historical snapshot; concurrent transactions may change later metrics. FE displays collection time and must not infer a conservation equation across cards. No cache, dirty reads, demo fallback or synthetic zero on failure. Database failures propagate through shared error handling.

Error envelope follows shared VI/EN contract: 401/403 as above; infrastructure failure is a non-success response, not an all-zero result. Empty DB legitimately yields zero and catalog role counts.

## User administration boundary — PS-109 (not implemented by PS-107)

Long owns user list/detail and lock/unlock. No path/DTO below is claimed to exist. Public user UUID, common page/size/content/totalElements/totalPages, UTC time and explicit whitelists are required. Mutation receipt must identify the public user, authoritative resulting state and server timestamp; state preconditions/concurrency and audit must be atomic, and stale requests must return 409. FE must not synthesize success or retain private data after account/session/role changes.

Open policy decisions for PS-109: self-lock, last Admin, internal accounts, allowed source/destination states (including non-ACTIVE), mandatory reason, session/token revocation rules and idempotency/concurrency receipt. These are not default-allowed or default-denied implementations here. Do not ship writes until the group/user approves them. Existing auth already rejects non-ACTIVE/deleted accounts on the next protected request; PS-109 must verify this for its actual mutation and audit transaction.

## Audit boundary — PS-108

PS-108 supplies its own linked read contract, tests and additive public event ID. Reads reuse existing append-only PS-13 events. Safe metadata only; raw details/states/IP and arbitrary context are not part of the Admin response. No audit write/update/delete routes.

FE PS-110 owns VI/EN/mobile/browser integration and cancellation of late responses after session/account changes. Backend SQL/HTTP tests are not FE E2E.
