# PS-84 — Password recovery frontend

Integrated with PS-112 on develop `682e447` using `docs/api-contracts/password-recovery.md`. Frontend only; no backend, migration, provider or runtime mock changes.

- Public POST `/auth/password-recovery/requests` sends email and selected locale; only the documented 202 acknowledgement is accepted. Neutral UI does not claim email delivery or reveal account eligibility.
- Public POST `/auth/password-recovery/reset` sends credential and exact password; confirmation stays in FE. Empty 204 is success. Neither endpoint sends a JWT.
- Reset credential is read from the email fragment into component memory and removed from the URL before paint. It is never persisted. Reload requires reopening the email link. Visiting the link never submits a request.
- Recovery requests use no-store and no-referrer. The document declares no-referrer before external font requests. There is no third-party tracking added.
- Reset validates 8–72 UTF-16 characters, at most 72 UTF-8 bytes, nonblank, valid surrogate pairs and no NUL, without trimming the submitted password.
- RATE_LIMITED, RECOVERY_INVALID and password validation errors map to existing localized UI states. Duplicate submits are blocked; leaving aborts and ignores late responses.
- Successful reset aborts session refresh/restore, clears the tab session and returns to login in the selected language; it does not automatically sign in.
- Resolved App.jsx conflict by preserving current Admin routes and existing application flows.

Validation: 56/56 targeted recovery/session/landing/shared-with-me tests passed; full lint and production build passed. Existing large bundle warning remains. No dependencies added.

These are service/component integration tests using isolated fixtures. Actual email delivery, a real reset link/password change and server-side JWT revocation have not been tested end to end. Earlier screenshots show layout only, not API integration evidence.
