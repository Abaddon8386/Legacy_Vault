# Google sign-in backend configuration (PS-85)

The current PS-83 client sends the Google Identity Services ID token to
`POST /api/v1/auth/google` as `{ "credential": "<ID token>" }`. The backend verifies
the RS256 signature against Google's rotating JWKS, the Google issuer, expiration,
required OIDC claims, and `aud` against the configured Web OAuth client ID.

Configure the same **public Web Client ID** used by the FE:

```text
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

The application property is `legacyvault.auth.google.client-id` and reads
`GOOGLE_CLIENT_ID`. No Google client secret is used or needed for this GIS credential
exchange. Never put a client secret in a `VITE_*` variable. Keep the existing
`JWT_SECRET_BASE64`, encryption key, SQL Server settings, and allowed CORS origins
configured independently. If `GOOGLE_CLIENT_ID` is empty, `/auth/google` returns
`503 GOOGLE_SIGNIN_UNAVAILABLE`; password login remains available.

Example request:

```http
POST /api/v1/auth/google
Content-Type: application/json
Accept-Language: vi

{ "credential": "<credential returned by Google Identity Services>" }
```

Success returns the same `LoginResponse` as `/api/v1/auth/login`:

```json
{
  "accessToken": "<LegacyVault JWT>",
  "tokenType": "Bearer",
  "expiresInSeconds": 3600,
  "user": {
    "id": "3f2b8c1e-0a4d-4c8e-9b1a-6a1d2f3e4b5c",
    "fullName": "Nguyen Van A",
    "email": "user@example.com",
    "roles": ["VAULT_OWNER"]
  }
}
```

Invalid/expired/replayed token returns `401 INVALID_GOOGLE_CREDENTIAL`. A verified
but unlinked Google subject, or an inactive/deleted account, returns generic
`401 INVALID_CREDENTIALS`. Errors use the shared `ApiError` structure and localized
messages. The endpoint never accepts FE-provided email, profile, role, or account ID.

Only a `GOOGLE` + exact Google `sub` mapping in `dbo.external_auth_identities`
authenticates. PS-85 does not register users or link by email. There is no approved
mapping-provisioning workflow yet; first-time Google sign-in stays denied until the
owner approves onboarding/linking and provisioning rules. Do not insert mappings
based only on an email match. See `../api-contracts/open-decisions.md`.

The endpoint is stateless and does not use cookies. CORS remains restricted by
`CORS_ALLOWED_ORIGINS`; same-origin Vite proxy is supported. A SHA-256 fingerprint
of a successfully exchanged credential is stored until expiry; expired fingerprints
are pruned on a later Google login. This prevents the same credential from minting
multiple LegacyVault sessions. The original Google token is never stored or logged.
HTTPS is required outside local development.

Unit tests use locally signed synthetic tokens and do not prove Google credentials,
Google Console configuration, network access to Google's JWKS, or production-domain
integration. Those checks remain pending until a controlled real Google test is run.
