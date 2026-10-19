# PS-84 — Password recovery frontend

Source: [PS-84](https://thaithai9785.atlassian.net/browse/PS-84). This PR implements only Huy's FE scope. No backend, database, email provider, API endpoint or runtime mock is added.

## Delivered

- Forgot-password link on every login entry point, using the existing application navigation.
- `/forgot-password`: email input, format validation, VI/EN, keyboard focus, pending/error and neutral acknowledgement UI.
- `/reset-password`: new-password and confirmation form, matching the current registration validation (8–72 characters), visibility toggle, invalid-recovery/error and completion UI.
- Reuses login controls and existing design tokens. Styles are scoped to recovery and the added login link; no global redesign or new dependencies.
- Duplicate submissions are blocked; navigation/unmount aborts pending work and late results are ignored. Sensitive provider errors are not rendered; passwords are not trimmed, stored, logged or added to URLs.

## Current limitation

Neither operation is connected in `App.jsx`. Both submit buttons remain disabled there and explain the unavailable/verification-required state. Visiting a reset URL does not verify a credential. No query parameter activates reset, no success is fabricated, and the existing session/login rules remain unchanged.

The form accepts optional `onRequestRecovery` and `onResetPassword` component callbacks. A future approved integration must resolve them only after genuine service success, propagate failures, and honor `AbortSignal`. These are component hooks, **not an HTTP contract**. No recovery token/code format or sending method has been selected.

## Items for the backend owner/team lead

Please assign and agree the following before integration:

1. Actual recovery request/verification/reset contract and OpenAPI, including safe success/error normalization.
2. Email provider and delivery configuration; link versus verification-code flow; approved redirect URI. The FE paths above are presentation routes only, not agreed email redirect URIs.
3. Credential validity, single use, expiry, concurrency protection and send/attempt limits. No numerical limits have been invented in FE.
4. Treatment of Google-only, locked/deleted accounts without account enumeration or unintended account linking/creation.
5. Final password policy, revocation of existing sessions/JWTs, safe audit and configuration handling.

The FE recognizes normalized error keys `RATE_LIMITED`, `RECOVERY_INVALID`, `PASSWORD_POLICY` and a generic failure. The real integration can map the approved service response to these UI states; these names do not define new backend error codes.

## Verification

- `npm test`: **708/708 passed**; `npm run lint`, `npm run build` and `git diff --check` passed. The existing bundle-size warning remains.
- Browser review: desktop 1280×720 and mobile 390×844; request/reset layouts do not overflow horizontally. Labels, focus, language selection and unavailable state were inspected. No real credential was changed.
- Evidence: [request, desktop](../screenshots/ps-84-forgot-password-desktop.jpg), [reset, mobile](../screenshots/ps-84-reset-password-mobile.jpg).
- Component tests cover validation, localization, focus, generic account/provider failures, throttling feedback, duplicate submissions, invalid recovery, late responses and actual App route/login navigation.
- Unit/component fixtures exist only in tests; no user data, recovery credential or demo service is embedded in application code.
- Actual email delivery, valid/expired/used credential enforcement, password change, old-password rejection and JWT revocation are unverified until the BE flow exists. This PR does not claim the full FE/BE Jira DoD is complete.
