# PS-113 — Owner guardian contract

Policy proposed on 2026-10-21 (D-API-45, pending group approval). Guardian is a contact linked to one beneficiary, not a Trustee, login identity, invitation recipient override or permission to receive/decrypt assets. No identity-document collection, email delivery or role assignment.

Age uses the calendar date in `Asia/Ho_Chi_Minh`. A beneficiary becomes ADULT on DOB plus 18 years (Java LocalDate: February 29 maps to February 28 in a non-leap eighteenth year). Null/future legacy DOB returns UNKNOWN; new beneficiary DOB keeps the existing PastOrPresent validation. MINOR without a guardian is a warning, not a save/read/handover gate. At most one current guardian. Name, relationship and at least email or phone required. Replacing/revoking preserves history. DOB changes and adulthood never automatically erase guardian history or alter rights.

Base: `/api/v1/vaults/{vaultId}/beneficiaries/{beneficiaryId}/guardian`. UUIDs only. All routes require authenticated ACTIVE non-deleted VAULT_OWNER and ownership of that exact vault/beneficiary. Reads remain available under existing owned-vault read rules; writes reuse the existing editable-vault lock and status rules.

- GET base: context with `beneficiaryId`, `revision`, `evaluatedOn`, `timeZone`, `ageStatus` (UNKNOWN/MINOR/ADULT), `guardianRecommended`, `warningCode`, nullable `guardian`.
- PUT base: create/edit/replace using `{ "expectedRevision": 0, "fullName": "Synthetic guardian", "relationship": "Parent", "email": "guardian@example.test", "phone": null }`. Returns context, HTTP 200. All fields are replacement fields, not a patch. Existing guardian is ended as REPLACED, a new immutable contact snapshot is inserted and revision advances. Email lowercased/trimmed; contact lengths match beneficiary fields (254/20). No format restriction added to existing phone convention.
- POST base + `/revoke`: `{ "expectedRevision": 1 }`, returns context. Ends current record as REVOKED and advances revision, including an empty current state. Reload after a lost response before retrying.
- GET base + `/history?page=0&size=20`: PageEnvelope, size 1–100, newest revision first. History contains current and ended records, visible only to Owner; no actor internal IDs.

Guardian snapshot: `id` UUID, `revision`, `fullName`, `relationship`, `email`, `phone`, `createdAt`, nullable `endedAt`, `endReason`. Timestamps UTC ISO-8601. Revision starts at zero for all existing beneficiaries and is independent of invitation generation/account linking. No PII in audit; only beneficiary reference, operation and revision.

Warnings: `BENEFICIARY_GUARDIAN_RECOMMENDED` (VI: Nên bổ sung người giám hộ cho người thụ hưởng chưa thành niên; EN: Add a guardian for this minor); `BENEFICIARY_DOB_REQUIRED` (VI: Bổ sung ngày sinh để xác định độ tuổi; EN: Add a date of birth to determine age). FE Huy can fetch this context after create/edit and on reload without changing existing BeneficiaryResponse. A failed guardian save must not recreate the beneficiary. Existing beneficiary/configuration reads keep their contracts.

Errors use the repo envelope: 400 VALIDATION_FAILED/MALFORMED_REQUEST; 401 UNAUTHENTICATED; 403 ACCESS_DENIED; 404 RESOURCE_NOT_FOUND for wrong ownership/cross-vault; 409 VAULT_NOT_EDITABLE or BENEFICIARY_GUARDIAN_STALE. Stale writes roll back, reload revision before retry.

Migration V49 follows V48 (PS-114 asset documents, already on develop); V47 was reassigned because Flyway rejects a lower, not-yet-applied version once a higher one is applied (no `outOfOrder`). It is additive and does not modify deployed migrations. Recheck the actual develop order before merging and never renumber an already applied migration. Roll back application without dropping guardian data or revision; pre-feature code ignores these additive objects. Restoring a database is an operations decision, not an automatic down migration.

FE UI/browser integration remains with Huy; this backend change does not certify that UI flow.

Synthetic FE context fixture: fixtures/beneficiary-guardian.json. Unknown fields are not mapped to persistence; only declared request fields are used.
