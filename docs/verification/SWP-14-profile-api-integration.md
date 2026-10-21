# SWP-14 / PR #142: PS-79 profile integration

Base: develop `54a5bf3`. Contract: `docs/api-contracts/auth.md`, PATCH `/api/v1/auth/me`.

- Saves changed full name and optional phone number through the authenticated endpoint. Empty phone removes the stored number. IDs, roles, status, password and email are not writable through this task.
- Requires a real 200 response for the current account with the profile phone field. The session uses the server whitelist and retains the existing access token and expiry; no optimistic success or runtime fixture is used.
- Keeps clean forms synchronized and unsaved drafts intact. Blocks duplicate writes, aborts on unmount/account/token changes, rejects other-account receipts and ignores stale results after logout.
- A save aborts any older account refresh. Refresh is blocked during the write so an older GET cannot overwrite the saved profile. Unauthorized saves end the session; forbidden saves lock further writes until reload.
- Adds the PS-79 `AUTH_PROFILE_UPDATED` audit action to the existing Admin validator so saving a profile does not break audit reads.
- Email stays read-only here. PR #159 builds on this implementation for Owner email editing and current-password verification. No new password-change UI is added.

Validation: 87 existing profile/edit tests passed; added service and actual-App integration tests cover five roles, authenticated partial PATCH, expiry preservation, HTTP/malformed receipts, phone validation, refresh ordering and logout during save. Beneficiary landing regressions pass with both omitted legacy phone and the new PS-79 phone field. Lint and production build passed; the existing bundle-size warning remains.

Full regression: 1,134/1,134 passed outside the sandbox (the local HTTP fixture requires localhost access). A subsequent focused run passed 13/13 integration tests, including the added keyboard focus/Escape regression for the unsaved-change dialog.

Tests use isolated synthetic data and JSDOM. No real account was modified and email/provider/SQL end-to-end behavior was not exercised. No backend or database edits.
