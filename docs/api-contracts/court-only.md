> **Stale-review fix:** POST `/basis-dossier/review` now requires `reason`, `versionNo`, `sha256Hash`, `allocationHash`, `disputeStatus` from the context snapshot displayed to Legal. Missing snapshot returns 400; any mismatch returns 409 LEGAL_DECISION_STALE before writes/audit, under Vault -> Case -> Dossier locks. Reason-only legacy clients must upgrade; no fallback to reviewing the newest version. Request-supplementation still takes only reason. FE captures the snapshot on load and sends it unchanged on review; it must not fetch a new hash at click time and silently attest that version.

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

## Distribution workflow (PR #227 follow-up, contract of PR #226)

Supersedes the COURT-only intake rules above for the distribution document. Legal does not pick a route first; the route follows the document actually submitted. The phase is derived on the server; `GET .../distribution-workflow` (Staff: `/staff/verification-cases/{caseId}`, Legal: `/legal-verifications/verification-cases/{caseId}`) returns `revision`, `phase`, `prerequisites`, `request`, `document`, `allocation`, one `capabilities` entry per action and `feedback`.

| Phase | Who acts | Endpoint |
|---|---|---|
| PREREQUISITES_PENDING | - | death document decided and will comparison MATCH are required |
| DOCUMENT_REQUEST_NEEDED | Legal | `POST .../request-documents` |
| AWAITING_DOCUMENTS | Staff | existing `POST .../basis-dossier/versions` (upload) then `.../versions/{version}/forward` |
| DOCUMENTS_UNDER_REVIEW | Legal | `approve-documents` or `request-document-supplementation` |
| AWAITING_ALLOCATIONS | Staff | `POST .../submit-allocations` |
| ALLOCATIONS_UNDER_REVIEW | Legal | `approve-allocations` or `request-allocation-changes` |
| FINAL_APPROVAL | Legal | existing `basis-dossier/review` then `basis-dossier/decision` |
| APPROVED | Legal | existing `POST .../unlock` |
| UNLOCKED / CLOSED | - | read only |

- Every POST carries `revision` (409 `DISTRIBUTION_WORKFLOW_STALE` if it moved) and, for document/allocation steps, the `documentVersion`/`documentSha256` (and `allocationVersion`/`allocationSha256`) the caller looked at. Reasons are required (non-blank, max 1000) except for `submit-allocations`.
- Upload and forward are only accepted in AWAITING_DOCUMENTS (vault DOCUMENT_VERIFICATION, WILL_VERIFICATION or AWAITING_LEGAL_BASIS; never AWAITING_VERIFICATION). Upload stores the document only: `metadata.allocations` must be empty (400 otherwise). If the case has no dossier the first upload opens one from the document type (NOTARIAL_PARTITION -> NOTARIAL, COURT_* -> COURT) without recording a classifier. Forward moves the vault to LEGAL_BASIS_VERIFICATION; it approves nothing.
- `approve-documents` needs a reviewable stored document. COURT: the stored file and court metadata must be reviewable, and Legal's acceptance records the VALID court assessment of exactly that version (there is no separate court-conclusion step in the new workflow; upload alone never counts as valid). NOTARIAL: a stored deed with notary, number and date, no recorded dispute and a MATCH will comparison. It is not an allocation and not the final approval.
- `submit-allocations` replaces the allocation of the accepted document version (old rows become `SUPERSEDED`, kept as history) and makes an earlier final review stale. `approve-allocations` is not the final approval either, but it records Legal's review of the exact current snapshot (version, hash, allocation hash, dispute), so the old "complete review" call is no longer needed before `decision`. A dispute or any change after that review makes `decision` fail with 409 LEGAL_DECISION_STALE.
- `basis-dossier/decision` (APPROVE and REJECT, non-blank `reason` max 1000) is accepted only in FINAL_APPROVAL/APPROVED and `unlock` only in APPROVED; the Legal context `capabilities.approval/unlock` reflect that with `blockedReason`.
- Not covered: notifications (no service or owner yet).
