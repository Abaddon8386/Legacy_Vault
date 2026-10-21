# SWP-24 / PR #159: Owner email editing with PS-79

This branch includes the shared profile integration from PR #142 (`dc137f0`) so both tasks use one request/session implementation. Both PRs target develop; review/merge #142 first, then #159. No backend changes.

## Delivered frontend behavior

- Only accounts with Owner and without Staff/Legal roles can edit email. Existing mixed Owner + Staff/Legal accounts remain read-only. Admin-only and Beneficiary-only accounts also stay read-only.
- Changed email is trimmed/lowercased and submitted with the exact `currentPassword` in the same PATCH `/auth/me`. No separate password verification endpoint or password-change form is invented.
- Name/phone changes do not send password proof. Case-only email changes do not request proof or trigger a write.
- The service checks the same email permission before building the body. System fields and new passwords are rejected; responses must belong to the current account. Actual server data updates the tab session without changing token expiry.
- Duplicate submit, unmount/logout, token/account and email-permission changes are guarded. Password proof is only component/request memory, is cleared after each attempt or context change, and is never placed in storage, URL, logs, or error messages.
- Incorrect proof (403 REAUTH_FAILED) can retry after re-entry; generic 403 locks writes. Duplicate email (409), validation, throttling (429), and network/server failures show localized truthful messages and retain the non-secret draft.
- VI/EN labels, errors, dirty-state navigation and keyboard focus use existing scoped controls and styles. No form reset button is restored.

## Backend boundary

PS-79 currently authenticates the account and requires password reauthentication, but `AuthService.updateCurrentUser` does not restrict email mutation by role. This PR implements the agreed FE behavior; it is not proof that Staff/Legal email is immutable through direct API requests. The BE owner must enforce the same role policy if that is required as a server authorization rule. No email-verification flow is claimed or fabricated.

## Verification

28 dedicated service/component/App integration tests passed before full regression: five-role name/phone saving, Owner email/proof payload, exact password whitespace, no-op normalization, role combinations, stale/aborted results, duplicate attempts, error mapping, secret cleanup, refresh ordering and logout/session isolation. Existing task-24 role/validation tests are retained.

Full lint and production build passed; the existing bundle-size warning remains. Automated integration uses isolated synthetic data and JSDOM. Real-account email mutation, provider delivery and SQL/browser end-to-end behavior have not been exercised.

Final full regression on the combined implementation: **1,160/1,160 tests passed**, no skipped tests. Run outside the sandbox to allow the existing local HTTP fixture.
