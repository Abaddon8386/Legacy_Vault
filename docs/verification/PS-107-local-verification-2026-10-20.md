# PS-107 verification — 20 October 2026

- User approved metric scope: nondeleted accounts (including locked/pending), non-ARCHIVED vaults, OPEN cases, per-role assignments on nondeleted users.
- Implemented GET /api/v1/admin/overview, ROLE_ADMIN at HTTP and service boundaries; no-store, metadata counts only. Existing auth rechecks DB status/deletion/roles on every request.
- Real SQL Server/JWT HTTP tests: 3 pass. Empty DB; multi-role without duplicated accounts; soft-deleted users and role assignment exclusion; locked accounts counted; ON_HOLD included and ARCHIVED excluded; OPEN vs CANCELLED; independent SQL reconciliation; UTC interval; no private content; anonymous 401, revoked role 403 despite Admin JWT claim, locked/deleted old-token 401.
- Final clean backend regression with LEGAL/STAFF SQL fixture opt-ins: 652 tests, 598 passed, 54 skipped, zero failures/errors.
- Additional AdminOpenApiContractTest: 1 passed (all local refs resolve, duplicate keys rejected, public overview response fields). Total distinct passed: 599. Skips: subscription prototype 23, lifetime images 28, DMS concurrency 3 (separate PS-91 evidence).
- Initial archived fixture attempted a second vault for one owner and correctly hit the existing unique constraint; fixed to transition the fixture's own vault before archive. No production DB changed.
- Existing upgrade test now derives pending migration count, still requires V28/29/30, validates preservation and idempotency; no applied SQL migrations changed.
- Collection is explicitly READ COMMITTED over DB UTC startedAt/completedAt, not atomic cross-table snapshot. No fabricated zero on errors, no cache/demo fallback.
- Contract: docs/api-contracts/admin.md; PS-109 mutations/policy remain Long's scope. No FE/browser E2E, uptime/risk, subscription-admin duplication or user writes.
- No merge or Jira mutation. Handoff, secrets and logs excluded.
