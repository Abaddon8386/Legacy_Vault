# Handover Sessions — PS-60 (LV-HANDOVER-001)

Tất cả endpoint yêu cầu `STAFF_EXECUTOR`; thao tác chỉ áp dụng cho ca đang được gán cho Staff trong principal. Session liên kết trực tiếp với verification case và Staff; Vault được xác định qua `verification_cases.vault_id` để tránh lưu lặp quan hệ.

- `POST /api/v1/staff/verification-cases/{caseId}/handover-sessions` mở session mới khi case `OPEN`, đang gán cho Staff gọi API và Vault `UNLOCKED`.
- `GET /api/v1/staff/verification-cases/{caseId}/handover-sessions?status=OPEN|COMPLETED|CANCELLED` truy vấn lịch sử session, tùy chọn lọc status.
- `GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}` xem chi tiết.
- `PATCH /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/status` nhận `{"status":"COMPLETED"}` hoặc `{"status":"CANCELLED"}`.

Lifecycle là `OPEN → COMPLETED | CANCELLED`; status đã đóng không thể đổi tiếp. Mỗi case chỉ có tối đa một session `OPEN` cùng lúc; sau khi đóng, có thể tạo session mới và giữ lịch sử cũ. Duplicate session trả `409 HANDOVER_SESSION_ALREADY_OPEN`; trạng thái case/Vault/session sai trả `409 HANDOVER_SESSION_INVALID_STATE`. Case hoặc session không được gán cho caller trả 404.

Mở session và cập nhật status dùng transaction, khóa theo thứ tự Vault → case → session; SQL Server filtered unique index là rào chắn cuối cho duplicate `OPEN`. Audit `HANDOVER_SESSION_OPENED`, `HANDOVER_SESSION_COMPLETED` hoặc `HANDOVER_SESSION_CANCELLED` cùng transaction, không chứa nội dung tài liệu hay secret.
