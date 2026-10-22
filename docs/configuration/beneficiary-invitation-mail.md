# PS-106 invitation mail via Resend

The existing encrypted outbox is now delivered by an opt-in worker. Owner-generated codes remain manually shared; this change only delivers Staff requests authorized by the existing PS-106 endpoint.

## Local configuration

Set these in the backend process environment, never in VITE variables or Git:

- `INVITATION_EMAIL_ENABLED=true` to enable delivery; default false.
- `RESEND_API_KEY`: existing Resend key with send access.
- `INVITATION_EMAIL_FROM`: provider-approved sender/domain. Falls back to `RECOVERY_EMAIL_FROM` if already configured.
- `INVITATION_RECIPIENT_ALLOWLIST`: comma-separated approved demo recipient emails; falls back to `RECOVERY_RECIPIENT_ALLOWLIST`. Empty allowlist or incomplete enabled configuration prevents startup.
- `INVITATION_EMAIL_POLL_MS`: delay after each job, default 1000 ms. Keep a positive value suitable for provider quotas. One job per poll per instance.

The recovery email enable flag, reset URL and recovery worker are unchanged. A Google Client ID cannot send this mail. Actual sending requires a valid Resend account and approved sender; provider acceptance cannot guarantee inbox placement. Do not enable sending until recipients are authorized.

## Migration and delivery

Apply the new additive V50 migration after current develop V49. V46 and existing applied checksums are unchanged. V50 records the request case/Staff, processing timestamp, state constraint and queue index. Old rows lack authenticated case provenance and are skipped rather than guessed/backfilled. Reissuing an old invitation must use the existing approved generation lifecycle; repeated POSTs never resend an already queued code.

Worker claims a row atomically with SQL Server UPDLOCK/READPAST/READCOMMITTEDLOCK. It rechecks the current Legal approval/allocation, assigned active Staff role, unlinked counter-verified beneficiary, latest confirmed address and invitation lifecycle/hash. It decrypts only a matching invitation-bound AES-GCM payload and sends the existing bilingual code-only template. No asset information, raw code, recipient or provider error body is returned by API or logged.

Provider POST uses fixed `https://api.resend.com/emails`, no redirects, 5-second connect/10-second request timeout, and `Idempotency-Key: beneficiary-invitation/<outbox-public-id>`. Resend retains keys for 24 hours: https://resend.com/docs/dashboard/emails/idempotency-keys . There are no automatic retries, including after crashes/ambiguous network results, so that retention window is not relied on for unbounded retry.

QUEUED/CLAIMED/SENDING are pending. ACCEPTED means provider acceptance only. Explicit rejection is FAILED; uncertain send/receipt or acceptance persistence failure is UNKNOWN. Ineligible/revoked/expired/consumed/superseded invitations are SKIPPED. The pre-send check is a transaction snapshot, not a lock held across network I/O: an invitation revoked during sending can still reach the inbox, but cannot be redeemed.

Terminal processing erases ciphertext/IV while retaining public metadata. Hourly maintenance also erases expired/revoked queued payloads and marks jobs abandoned for over 30 minutes UNKNOWN. It never reclaims them. A failure to persist the final state may leave a job pending until maintenance; never interpret that as permission to resend. Provider access/retention must be managed separately.

## UI and demo acceptance

Staff requests email after the existing counter/Legal prerequisites. FE shows queued/disabled truthfully and offers Check email status (also available after page reload for an attested address). Status uses the same assigned OPEN case scope and never includes address/code. No polling generates additional sends.

For a configured recipient: request -> check status until ACCEPTED -> inspect actual inbox/spam -> sign in/register through the existing invitation flow -> enter code in Shared with me. A link does not grant access to assets before handover. Receiving/using a real email must be verified separately from unit/provider-mock tests.

Rollback: disable INVITATION_EMAIL_ENABLED first. Keep V50 and state columns/constraints; do not reset the application DB or rewrite Flyway history. A previous binary can still queue rows, but those rows lack the new provenance and will not be sent after re-enable. Do not manually requeue UNKNOWN jobs without reviewing the provider outcome.
