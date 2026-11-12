# PS-112 email configuration

Default: RECOVERY_EMAIL_ENABLED=false. No network request to Resend is made while disabled. Requests return 503 RECOVERY_UNAVAILABLE; reset can finish an already-issued link until expiry. Do not claim email integration/E2E until configured and tested with permitted recipients.

Configure outside Git (values below are placeholders only):

```text
RECOVERY_EMAIL_ENABLED=false
RESEND_API_KEY=<server-only API key>
RECOVERY_EMAIL_FROM=LegacyVault <no-reply@auth.your-owned-domain.example>
RECOVERY_RESET_URL=https://your-frontend.example/reset-password
RECOVERY_RECIPIENT_ALLOWLIST=approved-mailbox@your-owned-domain.example
```

After a domain/sender is verified with Resend, turn off click/open tracking for password emails in provider settings, configure all values and approve test recipients before enabling. Comma-separated recipient allowlist is mandatory; no wildcard is supported. Sender/API key are not VITE variables. Never paste the key into chat or verification evidence.

Reset URL must be the exact configured /reset-password URL, HTTPS without userinfo/query/fragment; `http://localhost:<port>/reset-password` (any port 1024-65535, host exactly `localhost`) is allowed for local testing only, so a dev server on 5173, 5196 or 5198 all work. This configured URL is the redirect allowlist; requests cannot choose it or derive it from Host headers. No redirects are followed by the mail client.

Startup fails closed if email-enabled=true but required settings are missing/invalid. Mail HTTP timeout is 10s; connect timeout 5s. Provider responses/bodies/exceptions are not logged, and FAILED jobs are not automatically retried. Enabling this configuration is an explicit operational action separate from merging source.

Run integration tests with email disabled and a test-only transport. Never migrate shared/application databases as part of tests. LEGAL_SQLSERVER_MASTER_URL must target master; SQL fixture classes create/drop UUID-named databases. Use existing JWT/encryption configuration independently; never rotate the vault encryption key to revoke sessions.

PS-112 now uses a single V41 migration after develop's V40 (PS-103), including email binding and PREPARED state from creation. The old unpublished recovery V39/V40 files must not ship. Keep email disabled during deployment and testing. Signing-key rotation also changes the derived email-binding HMAC key, invalidating outstanding links. For rollback, follow the explicit route-block/revocation/session-invalidation procedure in password-recovery.md; never start an earlier recovery binary with delivery disabled while leaving reset publicly reachable. Do not repair or relabel migration history on databases that used the obsolete private feature migrations; review them separately from develop V40 upgrades.

## Demo/test: send all recovery mail to one mailbox

`RECOVERY_REDIRECT_TO=<one real mailbox>` (default empty = off) makes every recovery email, and the PS-116 verification email that shares the same sender, go to that single address. The body starts with `Account / Tài khoản: <account email>` so the tester knows which account a link belongs to. The redirect address is approved implicitly (no need to repeat it in the allowlist); accounts with fake mailboxes then need no allowlist entry. Startup fails if the value is not a single email address, and a warning is logged when it is on. Use it only for demos and testing, never in production, and keep the address in the personal env file, not in Git. Resend in test mode can only deliver to the Resend account owner's own mailbox. Rate limits still key on the account email.

## Client IP behind a proxy (rate limits)

Login, password-recovery, email-verification and payment limits key on `request.getRemoteAddr()`.
Behind a proxy every user shares the proxy IP, so set `FORWARD_HEADERS_STRATEGY=native` (default `none`)
so Tomcat reads `X-Forwarded-For`. Enable it only when the backend is reachable solely through a trusted
proxy (the Vite dev proxy sends only `X-Forwarded-For`; nginx must set `X-Forwarded-For`); otherwise clients can spoof their IP.
If a proxy also sends `X-Forwarded-Host`, the browser `Origin` must equal that public host; otherwise Spring answers 403 `Invalid CORS request` (the Vite proxy therefore must not use `xfwd`).
