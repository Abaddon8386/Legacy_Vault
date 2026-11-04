# Google signup — FE H1 / H2

Base: develop `12f5cb7`. BE contract inspected from PR #285 at `5b0a8e2`; API names come from source/DTO and `auth.md`, including the fresh Google credential requirement omitted by the PR description.

## H1: Login and registration

Both existing Google buttons call `POST /api/v1/auth/google` with only `{credential}`. A validated backend login response creates the session; FE does not decode Google claims, create users, assign roles or merge by email. `GOOGLE_EMAIL_ALREADY_REGISTERED` guides password login then profile linking; `GOOGLE_EMAIL_NOT_VERIFIED` asks Google email verification. Google `INVALID_CREDENTIALS` uses an account-unavailable message instead of an incorrect-password message. Invitation mode keeps its existing behavior. H1 is a separate PR/branch.

## H2: First password

- `/auth/me`'s optional `passwordLoginEnabled` is validated and preserved. Older servers may omit it; absence is unknown, never assumed false.
- A shared dialog is mounted with the application and scoped to its current token/user. Known Google-only users get a setup action beside protected password forms and in their profile; email edits can start setup before requiring a current password.
- An explicit `403 PASSWORD_NOT_SET` from a protected adapter opens the same dialog. After setup succeeds, FE retries that exact request once with the new password, retaining its other fields and draft. `REAUTH_FAILED`, ordinary denial and rate limiting do not start setup or replay a write.
- Before setup, re-read `/auth/me`, require the same user and `passwordLoginEnabled: false`. Require confirmation of the new password and a fresh GIS callback. Never reuse the sign-in credential.
- `POST /api/v1/auth/password/setup`: Bearer session, `{password, credential}`, success **200 `{passwordLoginEnabled:true}`**. Use the 8–72 character policy and 72-byte ceiling. No client-supplied subject, actor or role.
- `GOOGLE_IDENTITY_MISMATCH`: choose the already linked Google account. Invalid/reused credentials require a new Google callback. No `/auth/google/link` call is used to establish the setup identity.
- Cancel, abort, account change and logout do not replay the protected action. Late setup responses cannot restore another account's draft. Setup has a 20-second timeout; an unconfirmed result is not called successful. A failed attempt clears the credential while retaining the entered passwords in the open dialog; closing clears the dialog state.
- New passwords/credentials live only in mounted form state and the immediate request continuation; no browser storage, URL or log entry contains them. The session stores only the capability flag after a confirmed receipt.
- Nested dialogs retain their draft and focus. Escape dismisses setup without closing the underlying dialog; the underlying GIS callback is restored after setup closes.
- Admin accepts and translates `AUTH_PASSWORD_SET`, so the new audit event does not invalidate the inbox of audit logs.

| Surface | Integration |
|---|---|
| Asset detail | Reveal adapter + first-password action |
| Asset edit / asset management | Update adapter, existing partial-save behavior preserved |
| Asset documents | Binary download adapter + first-password action |
| Asset images | Binary image adapter + first-password action |
| Received assets | Content and image adapters + password forms |
| Wills | Download/view adapter + first-password action |
| Account email edit | Proactive setup for a known Google-only account, then PATCH with `currentPassword` |
| Account profile | First-password action before linking another Google identity |

## Verification / integration limits

Tests cover both auth pages in VI/EN, all protected adapters above, correct/incorrect Google identity, missing credential, cancelled/aborted setup, account change, timeout, retained draft, nested focus/GIS ownership, old-account behavior and email change. Test credentials and API responses are synthetic; they do not prove Google login, BE authorization, replay prevention or SQL persistence.

The user explicitly deferred real BE/Google acceptance on 04/11/2026. Resume with a BE containing #285 and the team's security fixes, matching Google client configuration, and a real test Google account. Verify: new Google owner; existing email not merged; setup with a fresh credential linked to that same user; then edit an asset; audit readable. Also verify wrong Google identity, expired/replayed credential and two simultaneous requests on the real server.

Remaining BE review items in the supplied report are outside these FE changes: guarding extra Google linking while no password exists, concurrent-signup messaging, and stale PR/OpenAPI examples. This FE does not make a claim that those server issues have been fixed.
