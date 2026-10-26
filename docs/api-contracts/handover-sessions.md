> **PS-102, 20/10/2026:** [COURT-only](court-only.md) applies to new handover operations. Legacy NOTARIAL remains read-only; current court validation, exact allocation approval and counter guards are mandatory.

# Handover Sessions — PS-60 (LV-HANDOVER-001)

Tất cả endpoint yêu cầu `STAFF_EXECUTOR`; thao tác chỉ áp dụng cho ca đang được gán cho Staff trong principal. Session liên kết trực tiếp với verification case và Staff; Vault được xác định qua `verification_cases.vault_id` để tránh lưu lặp quan hệ.

- `POST /api/v1/staff/verification-cases/{caseId}/handover-sessions` requires an OPEN assigned case, an UNLOCKED or HANDOVER_IN_PROGRESS Vault (PS-65 moves it to HANDOVER_IN_PROGRESS on the first delivery), no hold, and a current Legal approval for the authoritative dossier/version/hash/allocation scope.
- `GET /api/v1/staff/verification-cases/{caseId}/handover-sessions?status=OPEN|COMPLETED|CANCELLED` truy vấn lịch sử session, tùy chọn lọc status.
- `GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}` xem chi tiết.
- `PATCH /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/status` accepts only `{"status":"CANCELLED"}` from Staff. COMPLETED is reserved for PS-71 after the dual completion gate.

Staff status lifecycle is OPEN -> CANCELLED only. The PS-71 use case must require all in-scope assets delivered AND all related beneficiaries confirmed before COMPLETED.

Open and status-update operations use transactions and lock Vault -> case -> session. Opening reuses LegalWorkflowGuard to check hold and current approval. The SQL Server filtered unique index prevents duplicate OPEN sessions. Audit HANDOVER_SESSION_OPENED and HANDOVER_SESSION_CANCELLED commits atomically and excludes document contents and secrets.
