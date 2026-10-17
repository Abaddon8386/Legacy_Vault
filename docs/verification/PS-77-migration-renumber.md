# PS-77 migration numbering — 2026-10-17

Existing branch/PR: feature/PS-77-subscription-quota, #64. No PR merge requested or performed.

- V18__preserve_lifetime_vault_ownership.sql replaces the former PS-77 V12 filename.
- V19__subscription_catalog_and_payload_usage.sql replaces the former PS-77 V13 filename.
- Both SQL blobs are byte-for-byte identical to origin's former scripts; only filenames change.
- V12/V13 belong to PS-44/45; V14/V15 to PS-41–43. All fetched remote branches were scanned;
  legal rereview/court/hold branches additionally use V16/V17. V18/V19 were unused.
- SubscriptionSqlServerTest reads the renamed V18 preflight and verifies Flyway records V18/V19,
  has no pending migrations, validates checksums and no longer contains the former PS-77 script names.

## Validation

Repository Maven wrapper, JDK 25, `backend/mvnw.cmd clean test`, with the PS-77 SQL suite enabled:
**219 discovered; 216 passed, 0 failures, 0 errors, 3 skipped. BUILD SUCCESS.**

SubscriptionSqlServerTest: 16 passed, none skipped. Coverage includes API/auth/catalog, default BASIC,
count/storage boundaries, UTF-8 and all-version usage, concurrency, real audit rollback, lifetime DB
guards, duplicate preflight and the migration-version check. The 3 skipped tests belong to the
separate opt-in DmsSqlServerConcurrencyTest suite.

contextLoads applies all 14 branch migrations to a fresh disposable database. The SQL service suite
uses a separate disposable database: first migrate to V11, then Spring applies V18/V19 and validates
the full history. Log: backend/ps77-migration-renumber-regression.log (ignored).

Both databases are task-created LegacyVault_PS77_* databases and are removed after the run.
The existing LegacyVault database, shared Flyway history, constraints and checksums are untouched.
No Flyway repair or shared DB reset is performed. An environment that already applied the old
PS-77 filenames requires its own reviewed deployment plan; this rename does not rewrite that history.

This follow-up changes numbering, its resource-path test and documentation only. It does not merge
develop/main into PS-77 or expand the existing paid-subscription/legal-evidence implementation scope.
