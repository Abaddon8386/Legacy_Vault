# PS-108 verification — 20 October 2026

## Implemented and checked

ROLE_ADMIN-only list/detail, public event UUID, UTC [from,to), fixed timestamp/sequence order, page/size/action/public actor/actor-kind filters. Response selects only whitelisted metadata; raw details, state, IP, email/name/roles and arbitrary context never leave the service. Unknown labels map to LEGACY_EVENT/OTHER. LEFT JOIN retains SYSTEM/null/deleted/orphan actors. No audit mutation endpoints or business writes; no-store responses.

V37 adds event public identity/default and read indexes without rewriting old event payload/time/state. Existing writer inserts continue with DB UUID default; append-only UPDATE/DELETE triggers stay enabled. Lower V34/V35/V36 PR migrations must be applied/coordinated before V37 when deployed together; no repair/out-of-order. Binary rollback keeps additive IDs/indexes and existing event history.

## Evidence

Java 25, Spring Boot 4.1.1, disposable SQL Server databases only. LEGAL_SQLSERVER_MASTER_URL and STAFF_SQLSERVER_MASTER_URL enabled.

- Initial five real SQL/HTTP API tests passed.
- Dedicated V33 -> V37 migration test passed: old action/payload/states/time preserved, populated UUID valid, future inserts unique/defaulted, rerun idempotent and validate passes; SQL UPDATE/DELETE remain blocked.
- Final clean regression: **656 tests, 602 passed, 54 skipped, zero failures/errors**. Includes the five API tests, migration test and OpenAPI test.
- API coverage: half-open UTC bounds and equivalent offset, deterministic equal-time pagination, unknown/deleted/system/orphan actors, action/actor filters, extreme page, invalid times/ranges/actions/UUID/page/size, 404 detail, no-store, secret/nested/raw-state/IP exclusion, unknown action redaction, real signed JWT 401/403/current role revocation/locked account, all non-Admin roles denied, mutation methods 405 and database append-only enforcement.
- OpenAPI references and duplicate keys checked; an initially incorrect response ref was corrected to the repository's ValidationError component, then the final clean run passed.
- 54 skips: subscription prototype 23, lifetime images 28, DMS concurrency 3 (covered separately in PS-91). No FE/browser E2E claim. READ COMMITTED pages may shift under concurrent inserts; explicitly documented, no fake snapshot/zero.
- Orphan-actor test temporarily relaxes only the FK in its own disposable database to model historical imports, then restores enforcement for future writes. Runtime code/migration never disables constraints/triggers.

## Boundaries

PS-109 writes/user policy and FE PS-110 remain their owners' scope. Shared admin.md is identical to PS-107's contract. Existing migration-upgrade test derives pending count while retaining V28/29/30 and data/idempotency checks; no applied migration modified. No merge/Jira changes. Handoff, logs and secrets excluded.

## Review follow-up — 20 October 2026

Reproduced a UTC portability bug under America/New_York: SQL DATETIME2 2026-03-08 02:30 was returned as 03:30Z during the JVM DST gap, and Timestamp-based filter bounds could move as well. Replaced Timestamp conversions with JDBC 4.2 LocalDateTime bindings/reads, then UTC conversion explicitly. New SQL regression changes/restores the JVM zone and checks both detail and half-open search for the exact event. Targeted API/migration/OpenAPI suite: 8 passed, zero failures (6 API, 1 migration, 1 contract). Four-PR combined verification is recorded separately.
