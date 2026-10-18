# Signed Handover Receipts — PS-61

All endpoints require `STAFF_EXECUTOR` and the authenticated Staff must still be assigned to the case. A receipt can be created only after its session is `COMPLETED`, while the Vault remains unlocked and the current legal dossier passes the protected handover gate. The recipient must be `VERIFIED_AT_COUNTER`; every requested asset must be in the recipient's current Legal-approved allocation.

`POST /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/receipts` accepts:

```json
{
  "recipientId": "<beneficiary-public-uuid>",
  "assetIds": ["<asset-public-uuid>"],
  "supersedesReceiptId": null
}
```

The server derives Staff and confirmation time from the principal and clock. `confirmationType` is `STAFF_ATTESTATION`: this records a Staff confirmation only and does not claim an electronic signature or a recipient's legal attestation. Dossier version, document hash, allocation hash, recipient and asset links are snapshotted from authoritative approved data.

Each POST appends a new immutable receipt and asset snapshot. To replace an earlier receipt, pass its public ID in `supersedesReceiptId`; it must belong to the same session and recipient and cannot already have another replacement. Existing receipt history is retained. A replacement is a new record, not an edit or deletion.

- `GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/receipts` returns receipt history newest first.
- `GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/receipts/{receiptId}` returns one receipt within the caller's assigned case/session.

Receipt creation, asset snapshots and `HANDOVER_RECEIPT_STAFF_CONFIRMED` audit are written in one transaction. Audit stores public identifiers, asset count and dossier version only; it excludes asset contents, identity-document values, and legal document content. SQL Server triggers reject receipt or receipt-asset updates/deletes.
