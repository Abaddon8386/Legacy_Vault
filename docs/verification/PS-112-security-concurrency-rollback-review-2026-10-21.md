# PS-112 security, concurrency and rollback review — 2026-10-21

Reviewed baseline: e2a4e1442e5c4e8b0f0d9723cb91e593d6c0ba5f, feature/PS-112-password-recovery. No merge, Jira mutation or real email enablement. Handoff files are excluded. Frontend code and public API DTOs are unchanged.

## Reproduced defects and fixes

1. **Recovery credential outlived its email binding.** A valid link issued to the previous email still changed the password after updating the account email. The new regression failed on the baseline because reset succeeded. V40 now adds an HMAC fingerprint of the normalized email at issue time; both usability check and atomic consume require it under the refreshed User lock. The queued request also cannot be silently retargeted when email changes between lookup and locking. Case-only changes preserve normalization. Signing-key rotation changes the derived binding key and invalidates outstanding links.
2. **Repeated preparation could issue multiple secrets from one job.** Two calls to prepare on the same CLAIMED job each created a credential; the baseline regression returned a second nonnull Delivery. Prepare now atomically transitions CLAIMED -> PREPARED in the same transaction as credential insert/audit. Concurrent/repeated calls have only one committed winner. A known rollback restores CLAIMED and creates no credential; production still does not automatically retry ambiguous/crashed jobs. Terminal states cannot be requeued through mark.
3. **JVM DST changed the UTC reset watermark.** Writing UTC LocalDateTime 2026-03-08T02:30 with America/New_York as the JVM zone stored 03:30 in SQL Server. This could suppress legitimate post-reset requests. The User.passwordResetAt mapping now uses Hibernate's JDBC 4.2 LOCAL_DATE_TIME directly, preserving DATETIME2 UTC wall-clock values without Timestamp/host-zone conversion. The regression passes without changing migration V39.

Worker interruption handling also stops claiming additional jobs after an interrupted/ambiguous send. Rate limiting now explicitly requests its own READ_COMMITTED transaction. Queue/counter behavior is verified on READ_COMMITTED_SNAPSHOT-enabled SQL Server; snapshot reads were not claimed as a reproduced baseline defect.

## Concurrency and rollback evidence

- Real SQL Server concurrent same-token and different-token reset: exactly one password/version mutation, second reset gets RECOVERY_INVALID.
- Concurrent prepare of one job: exactly one Delivery/credential; concurrent workers claim distinct jobs.
- Reset-vs-account-lock test now observes the reset SQL session waiting on LCK_M_* in sys.dm_exec_requests before allowing the lock transaction to commit. The reset then rejects the locked account; no timing-only assumption.
- Audit failure during reset rolls back password, consume, version and link revocations. Audit failure during prepare rolls back both PREPARED and credential insertion; an explicit retry after known rollback issues once.
- Eight concurrent limiter attempts with READ_COMMITTED_SNAPSHOT enabled admit exactly the configured three. Existing normal-isolation contention/window tests pass.
- V40 late DDL failure is injected when restoring the job-status constraint, after the fingerprint column and legacy-link revocation. It rolls back the added column, revocations, constraints and Flyway history. Retry succeeds without repair and repeat migration is a no-op. V39 rollback/upgrade tests still pass and V39 itself is unchanged.
- V40 preserves passwords, auth versions, user status/capability and consumed history. It revokes unconsumed V39 links without an email binding and adds a check preventing old writers from inserting new active unbound links. The previous consume predicate cannot consume those upgrade-revoked rows.
- Existing regression verifies password/Google-issued JWT revocation on the next protected request, provider identity preservation, versionless JWT rejection, locked/deleted/PENDING/Google-only exclusion, neutral acknowledgement, 429/Retry-After and sanitized errors. No credentials are stored in jobs or audit or returned through recovery APIs.

## Final verification

Full backend: `mvn -q '-Dtest=*' test` — **864 tests, 813 passed, 51 skipped, 0 failures/errors**. The 51 skips are unchanged prototype SubscriptionSqlServerTest (23) and LifetimeImagesSqlServerTest (28). Recovery/security/concurrency/migration review tests have no skips. This full run includes the final runtime changes and stronger SQL-wait/snapshot tests.

Environment: Java 25.0.4, Maven 3.9.16, SQL Server 17.0. LEGAL/STAFF fixture URLs target master for database creation only; contextLoads and DMS tests use separate UUID fixture databases. All fixtures create/drop only their guarded names. Mail is disabled; transport/client tests use mocks. No real Google verification or inbox delivery is claimed. Frontend was unchanged and was not rerun for this backend-only review; its previous 1,055-pass result is historical, not a recovery browser E2E claim.

## Deployment / rollback boundary

Deploy V40 with the secure binary and email still disabled. V39 links need a fresh request. Do not edit applied V39 or restore consumed credentials. Normal rollback retains schema/passwords and a compatibility binary preserving authVersion, email binding and prepare-once guards.

An older binary is not safe merely because email delivery is disabled: reset remains public and an old filter/consume path can ignore newer protections. If forced to fall back, block both public recovery POST routes, stop delivery, revoke every outstanding reset credential transactionally and invalidate existing JWTs through controlled signing-key rotation before starting the older binary. Keep recovery blocked until the secure binary is restored. No vault encryption-key rotation or password/role restoration is involved. This operational fallback was documented, not executed on an application database.

Real email and FE #148 integration remain unconfigured/unverified. Source configuration keeps RECOVERY_EMAIL_ENABLED=false by default and requires a sender, API key, exact reset URL and explicit recipient allowlist before enablement.
