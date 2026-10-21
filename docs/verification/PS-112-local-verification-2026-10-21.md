# PS-112 local implementation and verification — 2026-10-21

> Historical evidence before migration renumbering. The old feature-only V39/V40 described below are superseded by the single V41__password_recovery.sql after develop PS-103 V40. See PS-112-V41-develop-upgrade-2026-10-21.md for current upgrade/rollback evidence. Do not deploy or repair old private migration history from this report.

Branch: feature/PS-112-password-recovery. Base: origin/develop cbb2dd0. Changes remain local/uncommitted; no push, merge or Jira mutation. Existing CONTEXT-HANDOFF files are untouched and excluded from this work.

## Delivered

- Public request/reset APIs, shared VI/EN errors and OpenAPI; no token or password returned/logged.
- Durable neutral queue and SQL Server atomic rolling counters with HMAC identities: request IP 20/15min, reset IP 30/15min, credential 5/min, email cooldown 60s / 3 per 15min / 5 per day.
- 256-bit CSPRNG canonical secrets, purpose-bound SHA-256 hashes only, 15-minute TTL, at most 3 usable links. Merely opening the link never consumes it.
- User lock + state refresh + conditional consume; BCrypt/password version/link revocation/audit commit together. No account activation, role change, user creation or provider linking.
- Explicit Google-only exclusion; NULL legacy password capability preserves prior login but requires review before recovery. Proven registration audit plus BCrypt shape is backfilled by V39; new local users are explicit.
- All LegacyVault JWTs (including Google-issued sessions) carry authVersion and are checked against the DB. Legacy versionless JWTs must sign in again. Reset revokes previous JWTs at the next request.
- Resend HTTPS transport disabled by default; required sender/key/exact frontend reset URL/recipient allowlist. No automatic retry of ambiguous sends, no plaintext credential in queue/outbox, bounded worker and independent retention cleanup.
- Contract/configuration/rollback documentation and FE #148 handoff. This is backend implementation, not a claim that #148 has been integrated.

## Executed verification

Java 25.0.4, Maven 3.9.16, SQL Server 17.0. Tests use randomly named disposable databases through integrated Windows authentication. LEGAL_SQLSERVER_MASTER_URL and STAFF_SQLSERVER_MASTER_URL target master only for fixture creation/drop; contextLoads and DMS races use separate UUID fixture databases. Application/shared data is never migrated by these tests. Mail is disabled and any delivery tests use a fake transport/HttpClient.

1. Full backend `mvn -q '-Dtest=*' test`: **852 tests, 801 passed, 51 skipped, 0 failures/errors** after correcting OpenAPI component placement/error enum. The skipped suites are existing SubscriptionSqlServerTest (23) and LifetimeImagesSqlServerTest (28), whose separate prototype fixtures are not enabled. Recovery-specific suites have no skips. DMS concurrency, shared application context, Staff/Legal, invitation, payment, Admin and migration regressions run where their normal fixture guards are enabled.
2. Two extra regression cases were then added: Google-issued JWT invalidation with provider mapping preserved, and password-disabled reauth rejection. The complete Recovery SQL Server suite plus PasswordReauthServiceTest were rerun: **24 passed, 0 skipped/failures/errors** (15 + 9). No production code changed after the full run.
3. Recovery controller/security/provider tests cover public POSTs with stale bearer, neutral/suppressed acknowledgement, shared DTO validation including UTF-8 byte boundary, 429/Retry-After, fail-closed infrastructure errors, VI/EN, redacted DTOs, no response echo, fixed provider URL, no network while disabled/outside allowlist, and no unsafe retry.
4. Real SQL Server recovery tests cover old/new password login, single use, simultaneous same/different-link reset, user lock/deletion/Google-only/PENDING/expiry guards, queued-before-reset invalidation, three-link cap, concurrent worker claims, shared limiter contention, current/legacy/Google JWTs, safe persistence and audit failure rolling back password/consume/version/revocations.
5. V39 failure injection after user columns/credential/job DDL proves transactional rollback, absence of failed migration history, preserved old hashes, successful retry without repair and repeat-migrate idempotence.

6. Frontend regression: **1,055/1,055 passed**, lint and build passed (existing >500kB bundle warning). The initial sandbox-only run could not connect to local HTTP fixtures (EACCES); rerunning with localhost access passed without source changes. This does not certify the unmerged #148 recovery UI.
7. `git diff --check` passed. Fixture databases were checked after teardown; no PS-112/context/DMS/Legal fixture databases remained.

An initial migration batch compilation issue and deferred physical SQL transaction before sp_getapplock were reproduced and fixed; the final suites pass with the actual driver/server. Full-run contract failures were corrected rather than hidden or excluded. Raw logs remain ignored under backend/target and are not deliverables.

## Remaining operational/integration checks

- Real Resend account/domain/sender/API key and approved recipients have not been configured. No real email was sent and inbox delivery is not verified.
- FE owner must connect #148 to the documented contract, handle the URL fragment in memory, remove it from the address bar, set no-referrer and clear tab session on success. No browser recovery E2E is claimed.
- Review NULL password capability for legacy/internal accounts before enabling their recovery. No speculative backfill or direct password editing was performed.
- Deployment invalidates versionless JWTs once. Rollback must retain version-aware JWT verification or use a controlled signing-key invalidation; rolling back to the old filter alone can revive revoked JWTs. Keep V39 schema and changed passwords; never rotate the vault encryption key for session revocation.

See docs/api-contracts/password-recovery.md and docs/configuration/password-recovery.md for exact policy, request/response, retention, configuration and rollback steps.
