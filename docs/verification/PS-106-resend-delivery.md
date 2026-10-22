# PS-106 — Invitation email delivery verification

Verified locally on 2026-10-22, based on develop `0993ecd`.

- Backend targeted regression: 29 tests passed, including 14 SQL Server integration tests. Covers concurrent claims, eligibility, revocation, status authorization, payload erasure, provider failures and ambiguous outcomes.
- Migration regression: 1 SQL Server test passed. Upgrades V49 to V50, forces a migration failure, verifies transactional rollback, then successfully retries without repair. V46 checksum and legacy encrypted payload remain unchanged.
- Frontend full suite: 1,201 tests passed; lint and production build passed. Existing bundle-size warning remains.
- `git diff --check`: passed.

SQL tests used disposable fixture databases with Windows integrated authentication; they did not migrate the application database. Provider HTTP calls were mocked: no real email was sent and inbox delivery has not been verified.

Delivery defaults to disabled. Before demonstrating real delivery, configure Resend, a verified sender and the recipient allowlist, apply V50, enable delivery, then check the status through the Staff screen. `ACCEPTED` means provider acceptance, not inbox delivery. See [configuration and operational limits](../configuration/beneficiary-invitation-mail.md).

Backend test classes: `StaffCounterInvitationSqlServerTest`, `ResendInvitationMailTransportTest`, `InvitationMailWorkerTest`, `StaffInvitationEmailServiceTest`, `StaffInvitationEmailControllerTest`, `InvitationMailOutboxServiceTest`, and `InvitationMailMigrationSqlServerTest`.
