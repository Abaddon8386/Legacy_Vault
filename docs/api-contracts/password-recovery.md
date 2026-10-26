# PS-112 — Secure password recovery

Approved policy: Resend HTTPS API, 256-bit reset links, 15-minute TTL, durable rolling limits, single-use reset, revoke all LegacyVault JWTs. No OTP or account linking. This API does not grant roles or unlock accounts.

## API

Both endpoints are public POSTs. Do not attach an access JWT; an expired tab JWT is ignored on these exact POST paths. JSON only; `Cache-Control: no-store`. No credential or password is returned, including validation errors. Errors use the existing `ApiError`, `Accept-Language: vi|en` and trace ID.

`POST /api/v1/auth/password-recovery/requests`

Request: `{ "email": "recipient@example.test", "locale": "vi" }`. Email is required, validated, <=254 characters and normalized exactly as login. Locale is optional (default vi), vi/en only. No redirect/account ID/role field is consumed.

Response: `202 { "messageKey": "auth.recovery.requestAccepted" }`. FE displays a neutral acknowledgement: “Nếu tài khoản đủ điều kiện, hướng dẫn khôi phục sẽ được gửi.” This is durable request acceptance, NOT proof of delivery. Same status/body for unknown/ineligible addresses and per-email suppression. No account lookup or provider call occurs on the request thread.

Errors: `400 VALIDATION_FAILED`, `429 RATE_LIMITED` (`Retry-After: 900`), `503 RECOVERY_UNAVAILABLE` when configuration or durable acceptance is unavailable. Provider failures never produce account-specific public errors/status.

`POST /api/v1/auth/password-recovery/reset`

Request: `{ "credential": "<43-character canonical base64url secret>", "password": "<new password>" }`.

Success: `204`, empty body. FE clears any tab session and navigates to login; no automatic login. Confirmation is a FE field, not sent to BE. Shared registration/reset policy: nonblank, 8–72 UTF-16 characters, <=72 UTF-8 bytes, valid surrogate pairs, no NUL; never trim password. BCrypt remains the existing encoder.

Errors: `400 RECOVERY_INVALID` for unknown, malformed, expired, consumed, revoked, wrong-version or ineligible credentials; `400 VALIDATION_FAILED` for DTO violations (map password field to FE PASSWORD_POLICY); `400 PASSWORD_POLICY` for service-level policy failure; `429 RATE_LIMITED`; `503 RECOVERY_UNAVAILABLE` for infrastructure failure. No separate expiry/used/account status oracle.

## Frontend #148 handoff

Existing component callbacks are not HTTP adapters. Wire `onRequestRecovery({email}, {signal})` to requests and `onResetPassword({password}, {signal})` to reset with the credential captured from the approved URL. Resolve only on genuine 202/204; propagate AbortSignal/errors. Map RATE_LIMITED, RECOVERY_INVALID and password validation to the existing normalized UI states. Do not infer success from component availability.

Email link: configured exact frontend URL + `#token=<credential>`. Parse the fragment in memory, immediately `history.replaceState` it away; never sessionStorage/localStorage/log/analytics. Use `Referrer-Policy: no-referrer`, no third-party tracking on the reset page. GET must never consume a credential (email security scanners may visit links). A page reload after fragment removal requires opening the email link again. These FE changes remain a coordinated handoff to the owner of #148; this backend change does not claim browser E2E.

## Eligibility and sessions

Only ACTIVE, nondeleted, explicitly password-enabled accounts can recover. Google-only (`password_login_enabled=0`) is denied neutrally; password+Google linked accounts with the flag enabled can recover without changing their Google identity. PENDING/locked/deleted accounts remain unchanged.

The flag is tri-state for safe legacy migration: 1 = proven local password, 0 = explicitly password-disabled, NULL = unclassified. V41 classifies only valid-shaped BCrypt hashes with an AUTH_REGISTERED audit; NULL accounts retain existing password login but cannot recover until reviewed. New JPA-created users default to enabled; a future Google-only provisioning flow MUST explicitly disable password login. Never classify by Google email match, mapping existence, or a placeholder hash alone. No provisioning/backfill of unknown accounts is done at runtime.

JWT `authVersion` must exactly match the DB user version on every protected request. Reset increments the version atomically, invalidating password- and Google-issued LegacyVault JWTs at the next request. Google sessions themselves remain untouched. Deployment forces legacy JWTs without a version to sign in again once. Already-running authorized requests are not retroactively canceled.

## Limits and concurrency

- Request IP: 20/15min; reset IP: 30/15min; credential fingerprint: 5/min.
- Email: cooldown 60s, 3/15min, 5/24h, including nonexistent addresses. Per-email suppression is neutral 202.
- SQL Server HMAC bucket keys + transaction-owned application locks serialize rolling counters across instances. No raw email/IP/token in counters. A separate counter HMAC key is derived from the JWT signing secret with an explicit domain; rotating it also resets counter key identity (coordinate rotation operationally).
- Use `getRemoteAddr`, never trust client X-Forwarded-For. Default forwarded-header processing must remain disabled unless a trusted proxy boundary and upstream abuse limits are deliberately configured.
- At most 3 unexpired usable links. New requests do not revoke previous links. Any successful reset invalidates all links and previously queued requests for that account.
- Prepare lock order: Job -> User -> Credential. Reset takes User -> Credential and never locks Jobs. The transactional CLAIMED -> PREPARED transition permits only one committed preparation per job, including concurrent/repeated calls.
- Reset order: User lock, refreshed account state, conditional credential consume; password, version, revocations and success audit commit together. Audit failure rolls everything back. Concurrent replay/different links produce exactly one winner.

## Delivery, persistence and retention

Queue contains normalized email, locale, request UTC time and status; no token or email body. Worker claims a bounded batch with SQL locks. It creates hash-only credentials under the User lock, commits, sends the raw link from memory, and records provider acceptance. Raw link must necessarily transit the chosen email provider; provider access/retention must be controlled.

Statuses QUEUED/CLAIMED/PREPARED/ACCEPTED/FAILED/SKIPPED are internal, not public account-status endpoints. ACCEPTED means provider accepted, not inbox delivery. No automatic retry after a crash/ambiguous response; CLAIMED or PREPARED may remain after a crash. User can request again after cooldown. Links already delivered remain valid until expiry/reset. Requests older than 15 minutes are skipped. Operators monitor status counts without querying email bodies or logging credentials.

An independent hourly maintenance task removes jobs/counter events older than 24h and credentials expired >7 days, even when email is disabled. Audit retains existing project policy.

## Email binding and UTC

V41 binds each credential to an HMAC fingerprint of the normalized email at issue time. Under the account lock, reset verifies that binding as well as account ID/purpose/version/expiry. A link issued to a previous address cannot reset after the account email changes; case-only changes preserve normalization. Prepare refreshes the candidate and rejects an email that changed after lookup rather than retargeting the queued request. Changing the JWT signing secret changes the derived fingerprint key and therefore invalidates outstanding recovery links as well as JWTs/counter keys.

The password_reset_at watermark uses JDBC 4.2 LocalDateTime directly for SQL Server UTC DATETIME2. It must not pass through a host-zone Timestamp conversion: a JVM DST gap can otherwise shift UTC 02:30 to 03:30 and incorrectly suppress later requests. The limiter explicitly uses an independent READ_COMMITTED transaction; queue claiming is also tested with READ_COMMITTED_SNAPSHOT enabled.

## Migration and rollback

V41__password_recovery.sql is the only PS-112 migration. It follows the already merged V40__staff_intake_attachments.sql (PS-103) and includes email binding/PREPARED directly in the initial table definitions. The unpublished PS-112 V39 and V40 files were consolidated and removed before merge; no develop migration or applied shared checksum was edited. Fingerprints are NOT NULL from creation, so an older writer cannot create an unbound credential. Failed V41 rolls back all added columns/tables/constraints and Flyway history; retry needs no repair.

The upgrade regression installs an isolated develop release through V40, reproduces the validation failure when a V39 recovery file appears later, then upgrades to V41 with default outOfOrder=false. It verifies one new migration, unchanged V40 checksum/history, preserved passwords/roles/Staff attachment ciphertext and immutable-file guard. No repair, ignoreMigrationPatterns, manual history edits or out-of-order execution are used.

Migration coordination: PS-112 occupies V41 only; the proposed PS-87/PS-106 range is V42–V46, subject to their owner and actual merge order. This branch does not rename Long's migrations. Recheck latest develop before merging. Databases that already applied the obsolete private PS-112 V39/V40 are not develop V40 databases and must not be silently repaired/relabelled; use an isolated fixture or an explicitly reviewed data-preserving conversion plan. Never reset a shared/application database to hide this mismatch.

V41 preserves password hashes, roles, identities and user status. Unknown legacy password capability needs review, not invented defaults.

Rollback keeps columns/tables and new password hashes. Disable recovery email first. **Never roll back to a JWT filter that ignores authVersion:** that can revive revoked tokens. Deploy a compatibility binary preserving authVersion, email binding and prepare-once guards. The earlier pre-merge recovery binary is not a safe rollback target merely because it checks authVersion. If an older binary is unavoidable: disable recovery delivery and block both public recovery POST routes; revoke all unconsumed recovery credentials in one controlled transaction, then deliberately invalidate all JWTs by controlled signing-key rotation before starting that binary. Rotation alone does not make an old reset implementation check email binding. Keep recovery routes blocked until the secure binary is restored. Do not restore consumed links or decrement authVersion. Password reset never changes the vault encryption key.
