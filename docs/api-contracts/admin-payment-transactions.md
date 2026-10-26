# PS-115 — Admin VNPay transaction lookup

Implemented backend extension of PS-82, sourced exclusively from PS-80 `subscription_payments` (V35). No checkout/IPN rewrite, new schema, refund, manual entitlement, CSV, provider query or real charge. Frontend remains with Thái. Existing Admin catalog and account usage APIs keep using their existing repositories; PS-92 owns changes to counting/enforcement.

## API

All routes require authenticated ACTIVE/non-deleted account with ROLE_ADMIN from current database roles, not JWT role claims. Existing JWT expiry checks apply. No Owner/Staff/Legal/Beneficiary authority grants access by itself.

`GET /api/v1/admin/subscriptions/transactions`

Optional parameters, combined with AND:

- `query`: exact account email (case-insensitive), public account/payment UUID, 32-hex checkout reference, or 1–15-digit VNPay gateway reference. Trimmed, max 254 chars, no control characters; unrecognized search returns an empty page. No substring/wildcard/name search, internal account IDs or raw provider-payload search.
- `accountId`: public account UUID.
- `status`: PENDING, EXPIRED, SUCCEEDED or FAILED (case-sensitive).
- `from`, `to`: UTC-compatible ISO-8601 instants, filter checkout creation time, inclusive from/exclusive to; from must precede to. Example `2026-10-21T00:00:00Z`. Invalid dates/UUIDs return 400.
- `page=0`, `size=20`: zero-based, size 1–100. Fixed order `createdAt DESC, paymentId DESC` for deterministic tie-breaking. No client SQL/sort expression accepted.

Response: standard `PageEnvelope` (`content`, `page`, `size`, `totalElements`, `totalPages`). A successful query with no matches is HTTP 200 with an empty page. Database failure is existing `PAYMENT_TRANSACTION_SOURCE_UNAVAILABLE` (409), never converted into a fabricated empty success.

`GET /api/v1/admin/subscriptions/transactions/{paymentId}` returns the same whitelisted item. Missing UUID: 404 RESOURCE_NOT_FOUND. No write endpoints.

Item fields: paymentId/accountId UUID, accountEmail (current administrative identifier), planCode, catalogVersion, amountVnd integer, currency=VND, billingModel=LIFETIME, limits {assetCount,storageBytes,fileBytes}, status, persistedStatus, createdAt/expiresAt/completedAt (UTC), nullable gatewayReference, checkoutReference (payment UUID without hyphens). Account deletion/locking does not erase financial history; actor Admin must still be active. Email is current account data, not an invented payment-time contact snapshot.

Plan/version/price/limits come from immutable checkout snapshot columns, never the current catalog. BASIC remains free (5/100 MiB); initial STANDARD 499000 (50/1 GiB), EXTENDED 999000 (200/5 GiB); full target price upgrades. Legitimate historical prices or later published versions are displayed as recorded, not overwritten with these defaults. Free BASIC is not represented as a paid transaction.

Persisted states are exactly PENDING/SUCCEEDED/FAILED. SUCCEEDED/FAILED are written only by existing verified IPN processing. EXPIRED is derived from persisted PENDING and expiresAt <= one captured request observation time, matching Owner PaymentService. It does not update the DB, prove a failed charge, or prevent an existing valid delayed IPN from succeeding later. This model does not persist a distinct CANCELLED state; cancellation-like failures remain FAILED. Do not claim a user cancelled from return URL. completedAt is server IPN completion time, not bank settlement time.

No PAN/CVV, token, merchant configuration, idempotency key, signature, checkout URL, response codes, raw provider payload, password or vault content is returned. New read paths never mutate payment/catalog/entitlement/audit rows and do not send emails.

Count and page execute in a short SERIALIZABLE read transaction so IPN membership changes cannot produce different count/page observations. No dirty-read hints. This may briefly block IPN; no provider calls or user interaction occurs while locks are held. Pagination is stable for a given result set, not a snapshot spanning separate HTTP requests. Future high-volume indexing/continuation pagination requires profiling rather than speculative migration allocation.

Errors: 400 VALIDATION_FAILED/MALFORMED_REQUEST; 401 UNAUTHENTICATED; 403 ACCESS_DENIED; 404 RESOURCE_NOT_FOUND; 409 PAYMENT_TRANSACTION_SOURCE_UNAVAILABLE. VI/EN use the existing repo error messages. Frontend must distinguish no match from unavailable, clear private data on account/session changes and discard late responses. Existing PS-82 placeholder UI does not automatically consume this new contract; frontend integration/browser verification is still pending with Thái.

See admin-payments.openapi.yaml and fixtures/admin-payments.json (synthetic data only). No sandbox merchant is configured by this task; local signed fixture IPN tests do not certify VNPay production or sandbox E2E.
