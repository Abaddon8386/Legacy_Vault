# Admin audit reads — PS-108

See [Admin permissions and policy boundaries](admin.md) (PS-107 PR #167). This API is independent of overview/user mutations and reuses PS-13 append-only writing.

## Implemented endpoints

- GET `/api/v1/admin/audit-logs`: page (default 0), size (default 20, 1..100), optional from/to ISO-8601 instants, action, actorId (public user UUID), actorKind (USER/SYSTEM/DELETED_USER/UNKNOWN).
- GET `/api/v1/admin/audit-logs/{id}`: public event UUID; returns event metadata and traceId (nullable).

ROLE_ADMIN required at HTTP and service boundaries. DB-current roles/account status are checked by existing JWT auth. Cache-Control: no-store. Common page envelope content/page/size/totalElements/totalPages. Fixed occurredAt DESC then internal audit sequence DESC for deterministic ties; no client sort SQL. Internal tie-breaker is never returned. Offset pages are READ COMMITTED current observations: concurrent inserts can shift later pages; no historical snapshot promise. Count/list errors propagate, never synthetic zero.

Time window is [from,to), normalized to UTC; offsets accepted. If both supplied, from must precede to. SQL DATETIME2 year range 1..9999 enforced. Timestamp parameters are bound and never concatenated. action must be an AuditAction enum name or LEGACY_EVENT (historical unknown actions); actorId matches public UUID, including soft-deleted actors. Unknown actor UUID yields empty list, not a user-discovery error. actorKind SYSTEM is explicit SYSTEM events; UNKNOWN covers null actor/legacy unaffiliated events; DELETED_USER includes soft-deleted or missing actor account; USER is an existing nondeleted user (not necessarily ACTIVE). LEFT JOIN preserves system, deleted and orphan historical actors.

Example request: `/api/v1/admin/audit-logs?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z&action=AUTH_LOGIN_FAILED&page=0&size=20`.

```json
{"content":[{"id":"11111111-1111-4111-8111-111111111111","occurredAt":"2026-10-20T12:00:00Z","actor":{"kind":"SYSTEM","userId":null},"action":"AUTH_LOGIN_FAILED","entityType":"VAULT","vaultId":"22222222-2222-4222-8222-222222222222"}],"page":0,"size":20,"totalElements":1,"totalPages":1}
```

Detail: `{"event":<same event object>,"traceId":"33333333-3333-4333-8333-333333333333"}`. These UUIDs are examples only. Actor userId and vaultId are public UUIDs, not numeric DB keys.

## Response whitelist and redaction

Only event UUID/time, actor kind/public user UUID, known action, allowlisted entity type/public vault UUID, and optional detail trace UUID leave the service. Raw details, state_before/state_after, actor_roles, IP, names, email, entity DB IDs, reason strings, paper/identity references, tokens/passwords and vault/file content are not selected or returned. Unknown action is LEGACY_EVENT and unknown entity type is OTHER; arbitrary stored labels/context cannot escape through a fallback. No raw-context expansion flag or export endpoint. New useful metadata must be explicitly reviewed and added to the contract whitelist, never passed through blindly.

No POST/PUT/PATCH/DELETE audit routes. Reads do not insert events or mutate business data; PS-13 SQL append-only triggers remain enabled. 400 invalid filters/UUID/size; 401 missing/invalid/locked/deleted account; 403 current role lacks ADMIN; 404 missing event UUID; 405 unsupported mutation methods. Shared error envelope/messages support VI/EN.

## Migration / rollout / rollback

V37 adds public_id DEFAULT NEWID() NOT NULL WITH VALUES, unique index, and time/tie-breaker read index. Only new identifier metadata is populated for existing rows; action/time/payload/actor/history remain untouched. Existing writers omit public_id and receive the DB default. No UPDATE/DELETE events, no trigger disabling, repair or checksum edits. V33 -> V37 and future inserts are tested on disposable SQL Server.

Pending PRs use V34 (PS-86), V35 (PS-80), V36 (PS-91): coordinate/apply those lower migrations before V37 when shipping together, or assign a later new version before deployment. Do not enable out-of-order or repair applied history. Existing binary ignores additive columns/indexes; rollback application only, retain public IDs so bookmarked event references remain stable. Do not drop/backfill IDs on rollback. Schema change/index build requires normal SQL Server deployment locking; no zero-downtime claim.

FE PS-110 must handle pagination/UTC/empty/error, hide late private responses after session/account/role changes and integrate VI/EN/mobile/browser. Backend tests use fake sensitive fixture payload and do not prove FE E2E.
