# PS-89 — Beneficiary invitation frontend

Source: [PS-89](https://thaithai9785.atlassian.net/browse/PS-89), read on 20/10/2026. Base: `develop` at `86a88fe`. Scope: frontend only. No backend, database migration, endpoint, runtime fixture, invitation generation or role policy is added.

## AC traceability

| Jira requirement | FE implementation and limit |
| --- | --- |
| Code/status/copy beside the correct beneficiary | `BeneficiaryInvitationCode` is attached to each real beneficiary card. The internal presentation result must match both vault and beneficiary IDs; mismatches and late responses are rejected. Code copying is explicit and clipboard failure does not claim success. Until the approved loader exists, the row shows unavailable, with no fake code. |
| Person saved but invitation retrieval fails | Invitation loading/retry is separate from person creation. The row remains present and explains retry; the integration test verifies only one create request despite a failed code load and retry. Empty/loading/error/inactive states are covered. |
| Login/register and existing-account entry | Links on login/register and the authenticated account widget open `/invitations`. Existing users can log in without re-registering. The code is retained only in mounted React state while navigating auth pages. |
| No role assignment from a code | An acceptance result cannot supply roles. Successful linking must be followed by the existing `/auth/me` read, matching the current account, confirming `BENEFICIARY` and retaining existing roles. Failed role refresh retries the refresh only, not acceptance of the one-use code. |
| Multi-role and normal auth regression | A confirmed multi-role account stays on the success screen with an explicit beneficiary-page action; the separate multi-role landing task is not implemented here. Single-role beneficiary navigation happens only after server confirmation. Regular login/register, Google controls and introduction-page links remain. |
| Safe states and honest availability | New invitation operations are not connected by default, so real acceptance/registration cannot falsely succeed. Code/token data is not logged or written to URL/storage. Errors are rendered from internal safe UI keys, never raw provider messages. |
| Meaning and Staff assistance | The screen states that invitation linking does not unlock assets or bypass verification/legal handover, and explains later Staff assistance and the existing outside-system process. No Guest Portal, OTP or handover action is added. |

## Invitation registration safeguard

Registration entered through an invitation must not call the current ordinary Owner-registration path. It stays disabled until invitation-specific registration is bound under the approved policy. Google auth is unchanged in the regular flow; the invitation-specific Google path is disabled until its onboarding policy is agreed.

The non-secret `invitation=true` URL flag preserves **intent only** on auth-page reload. The actual code is never put in the URL or browser storage. After reload it must be entered again; the intent flag prevents accidentally falling back to Owner registration. Cancel and logout clear pending invitation state. Returning to normal registration requires the explicit exit action.

## Integration points, not an HTTP contract

`App` accepts optional `invitationActions` supplied by a future approved integration:

- `loadForBeneficiary({ vaultId, beneficiaryId }, { accessToken, signal })`: retrieve the approved invitation presentation data. Internal view: `{ vaultId, beneficiaryId, state, code? }`; `state` is a UI state (`available`, `empty`, `expired`, `used`, `revoked`), not a proposed backend enum. Only `available` displays a code.
- `accept({ code }, { accessToken, signal })`: resolve only after a genuine link acceptance. Its return value cannot update roles; `/auth/me` is authoritative.
- `register(valuesWithCode, { lang, signal })`: invitation-specific registration only after the new-account policy is approved. It does not reuse ordinary Owner registration.

These callbacks must translate the **approved** PS-86/PS-87 contract into UI results and failures. They do not specify HTTP paths, payload contracts, code length/format, validity period, issue/reissue/revoke operations, email matching or provider configuration. Normalized FE error keys are `INVITATION_INVALID`, `INVITATION_EXPIRED`, `INVITATION_USED`, `INVITATION_REVOKED`, `INVITATION_IDENTITY_MISMATCH`, `RATE_LIMITED` and a generic error. No corresponding backend error codes are assumed to exist.

## Decisions still owned by PS-86/PS-87

The Jira tasks must agree code lifecycle/retrieval rules, format/length, expiry, reissue/revocation, identity/email binding and invited new-account/Google policy. Real delivery/linking, one-use/expiry/concurrency enforcement and account-role persistence remain unverified until those services exist. This PR is FE review material, not completion of the shared integration DoD.

## Validation and UI evidence

- `npm test`: **740/740 passed**, including **16 PS-89 tests**. `npm run lint`, `npm run build` and `git diff --check` passed. The existing bundle-size warning remains.
- Component tests cover correct-record code/copy, clipboard failure, empty/inactive/error states, stale responses, retry without duplicate creation, invalid/expired/used cases, duplicate acceptance, role tampering, wrong identity, role retention, refresh retry, invitation registration reload, ordinary-auth payload isolation and authenticated entry.
- Browser: VI desktop 1280×720 and EN mobile 390×844; empty-code validation/focus and language selection inspected; mobile scroll width equals viewport width (390px).
- [Desktop evidence](../screenshots/ps-89-invitation-desktop.jpg) · [Mobile evidence](../screenshots/ps-89-invitation-mobile.jpg).
- Owner-code and successful linking states are verified with isolated test adapters only. No real invitation was generated/redeemed, no account was created or changed during browser review, and no mock is shipped in the application.

UI follows existing forest/gold/canvas tokens, scoped controls and card spacing. `notes.md` requires existing business behavior, VI/EN and desktop/mobile support; reference imagery is guidance, not a compulsory palette or layout. The external reference folder is not copied into Git.
