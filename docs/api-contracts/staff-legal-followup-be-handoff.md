# Staff/Legal demo follow-up — remaining BE contract work

User requested FE first and safe mocks where BE is missing. These are work items for the BE owners, not implemented endpoints or claims of completion. Keep existing SQL Server/demo database; no reset, migration edits or forged audit evidence.

## Immutable will comparison (Long / will-verification BE)

- FE now scopes history to `originalWillIntakeId`, clears result/reason when switching paper/digital source and refuses to record again for an already concluded paper.
- BE currently explicitly permits another comparison in DOCUMENT_VERIFICATION/WILL_VERIFICATION. Enforce the agreed immutable conclusion on the server under the existing case lock, including concurrent submissions and direct API calls. Do not delete or rewrite existing historical comparisons. Return a documented structured conflict for duplicate conclusion; publish whether a new digital version requires new paper intake before changing the policy further.
- Verify current paper identity + saved will version/hash, permission/cross-case, duplicate/replay/race and rollback with SQL Server. FE guard is not authorization.

## Counter attestation without manual reference code (Long / counter-link BE)

- Current CounterIdentityAttestation DTO still requires `evidenceReference` with NotBlank. Live FE keeps that required field until the replacement contract is available; it never supplies a fake generated code or skips attestation to force account linking.
- Remove the manual code requirement only through a revised DTO/service contract that preserves the actual in-person identity check, actor/time/account/case/recipient binding and audit. State explicitly how a counter check is evidenced; later signed asset receipt is a separate event and must not retroactively prove identity.
- Supply matching OpenAPI/fixtures for absent reference and keep wrong-identity/account/recipient/expired/stale/double-approve guards. Then FE can remove the field safely.
- FE replacement adapter may opt into `counterEvidenceMode: OPTIONAL`; isolated mock tests exercise omitted reference with identity confirmation still mandatory. The existing live adapter does not opt in, so current BE never receives a fake value or bypassed attestation.

## Final rejection and next Staff step (Ân / Legal approval + workflow read)

- Staff basis dossier DTO does not expose the current final rejection reason or legal decision identity. Distribution read can stay FINAL_APPROVAL after rejection. FE must not infer rejection from a generic phase or associate an old notification with a new document version.
- Return current decision + reason + source document/allocation revision and allowed next action in the authorized Staff read contract. Define the continuation explicitly: Legal requests document supplementation/allocation corrections, Staff edits only the reopened stage, Legal rechecks and approves. A rejected final decision must not create a permanent dead end or silently grant upload rights.
- FE notice accepts the adapter view model `{caseId, documentVersion, decision: LEGAL_REJECTED, reason}` through the optional `legalDecision` prop. It renders only for the selected case/current version, explains the next Staff step and never grants writing. This is mock-tested FE preparation; no HTTP field has been assumed.
- Verify old decision/new version separation, rejected → correction request → Staff submission → Legal reassessment, assignment/privacy/stale snapshots and audit rollback. Include a persisted notification receipt through PS-135.

## Other integration work

- PS-122/Dương: authorized Beneficiary read adapter described in PS-124-beneficiary-handover-fe-handoff.md.
- PS-135/Ân: missing hook and receipt coverage described in PS-137-staff-notification-handoff.md.
- Numbering: FE numbers current complete reverse-chronological intake lists oldest-first while keeping received date visible. If read endpoints become paged, BE must publish a persistent sequence; never number a partial page as the whole history.

These tasks need BE implementation/contract review and real SQL + two-account browser evidence before marking the related Jira work Done.
