# PS-102 — COURT-only, 20/10/2026

This contract supersedes NOTARIAL write paths and will-MATCH requirements in earlier documents. Existing endpoints, public UUIDs, roles and transactional locks remain. No migration, backfill or silent conversion of legacy dossiers.

## Workflow and authorization

1. Staff receives death evidence; Legal verifies it first. DMS timeout is not verification.
2. Legal classifies COURT or ON_HOLD from DOCUMENT_VERIFICATION or WILL_VERIFICATION. A will is optional and never substitutes court evidence; no synthetic MATCH. Reclassification accepts COURT from ON_HOLD only. NOTARIAL requests return 400 VALIDATION_FAILED.
3. Assigned Staff intakes COURT_JUDGMENT/COURT_DECISION with allocations and forwards the latest required version. Invalid type returns 400; unsupported route/state returns 409 BASIS_DOSSIER_INVALID_STATE. Encrypted evidence, hash and audit remain atomic.
4. Legal validates the current forwarded court version and reviews its SHA, allocation hash and dispute scope. Final approval requires current COURT VALID as well as the exact reviewed snapshot. Missing/INVALID/INCONCLUSIVE court assessment returns 409 COURT_DECISION_REQUIRED; stale snapshot returns LEGAL_DECISION_STALE.
5. Controlled unlock remains a separate mutation, rechecking court, approval and freshness under Vault -> Case -> Dossier locks. Staff can deliver only the approved recipient/items; new basis before delivery requires hold/re-review. Delivered history is immutable.
6. Delivery -> recipient confirmation and both completion gates -> close -> Staff receipt -> archive. No requirement for Legal to be physically present.

Queue filters and read responses retain NOTARIAL for history. Legacy NOTARIAL cannot intake, forward, review/supplement, approve, unlock or deliver anew. Historical records are not deleted or silently reclassified. Existing recipient-scoped DELIVERED reads after archive remain; Legal context grants no asset-content access.

## Examples and read semantics

Classification: `{"route":"COURT","routeReason":"Court evidence pending assessment"}`.
Final decision uses the existing shape: `{"decision":"APPROVE","versionNo":1,"sha256Hash":"<64 hex>","allocationHash":"<64 hex>","reason":"Evidence and allocation checked"}`. Client booleans are not proof.
Context capabilities.approval/unlock contain allowed and blockedReason. They are snapshot hints; mutations always recheck. willComparison.approvalBlocked retains its legacy will-comparison meaning and is not the COURT approval gate; FE uses the aggregate capabilities.
401 unauthenticated; 403 wrong role; 404 unavailable UUID/scope; 400 invalid request; 409 state/snapshot conflict. Shared errors provide VI/EN messages.

## Counter evidence and boundaries

User decision: keep existing business records and guards, physical Staff verification outside the system, server actor/time and paper evidence reference. No identity upload/OCR, no identity inference from invitation/account linking. PS-88/93/106 own further counter-attestation/invitation contract changes; no invented expiry, digital signature or scanned receipt upload. SQL fixtures with VERIFIED_AT_COUNTER test guards only and are not proof of a real meeting. FE adapters and browser E2E for PS-95/96/97/99/100/101 remain their integration scope.
