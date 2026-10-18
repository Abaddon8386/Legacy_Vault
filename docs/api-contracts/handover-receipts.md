# Staff Handover Confirmation Records — PS-61 (intermediate record)

Receipt creation is currently fail-closed. COMPLETED, VERIFIED_AT_COUNTER, and approved allocation alone do not prove that PS-65 delivery, PS-67 beneficiary confirmation, PS-68/69/70 dual completion, and PS-71 valid close have completed for the correct recipient and approved scope.

`POST /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/receipts` retains this request shape; creation currently returns 409 until completion evidence is integrated:

```json
{
  "recipientId": "<beneficiary-public-uuid>",
  "assetIds": ["<asset-public-uuid>"],
  "supersedesReceiptId": null
}
```

When enabled, the server must derive Staff and time from the principal and clock. `STAFF_ATTESTATION` records Staff confirmation only; it is not an electronic signature or a Beneficiary attestation.

When enabled, each POST must append an immutable receipt and asset snapshot. Replacements must create linked records and preserve history; existing database immutability triggers remain in force.

- `GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/receipts` returns receipt history newest first.
- `GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/receipts/{receiptId}` returns one receipt within the caller's assigned case/session.

After completion gates are integrated, receipt, asset snapshots and audit must be written in one transaction. Audit must exclude asset contents, identity-document values and legal document content.
