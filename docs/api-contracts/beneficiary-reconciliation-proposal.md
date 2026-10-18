# PS-67 — Beneficiary reconciliation (đề xuất tích hợp)

Trạng thái: **DRAFT, chưa phải API đã triển khai hoặc contract đã chốt**.
Nguồn: PS-67 và PS-54; đối chiếu `origin/develop` tại `d612b5d` ngày 2026-10-18.

## Yêu cầu đã có trong Jira

- Ghi nhận confirmation riêng cho từng Beneficiary: `PENDING` / `CONFIRMED`.
- Asset được bàn giao không tự xác nhận thay Beneficiary.
- Staff ghi nhận confirmation kèm receipt/reference; lưu actor và thời gian.
- Authorization phía server, transaction tại service, audit, lỗi vi/en và OpenAPI.

Nguồn:
- [PS-67](https://thaithai9785.atlassian.net/browse/PS-67)
- [PS-54](https://thaithai9785.atlassian.net/browse/PS-54)

## Dependency cần contract chung

Develop chưa có entity/table/API cho các phần dưới đây. Không dùng allocation `DRAFT`
trong `legal_basis_version_allocations` làm bằng chứng phê duyệt hoặc bàn giao.

- PS-57/58: approval hợp lệ, version/hash/scope bất biến và quy tắc vô hiệu hóa.
- PS-60: session ID, Staff/case/vault, lifecycle và thứ tự khóa khi mutation.
- PS-62/63: mapping Beneficiary với tài khoản; confirmation phải gắn Beneficiary
  trong approved scope, không chỉ gắn user vì cùng user có thể xuất hiện ở nhiều kho.
- PS-64/65/66: approved recipient set, delivered records và authorization guards.

Không tạo lại các model này trong PS-67 khi chưa thống nhất contract.

## Contract đề xuất để triển khai sau khi chốt dependency

Tên route/field dưới đây là đề xuất, chưa được đưa vào OpenAPI đang có hiệu lực.

- `GET /api/v1/handover-sessions/{sessionId}/beneficiary-confirmations`:
  Staff đọc tiến độ theo đúng session và approved recipient set.
- `POST /api/v1/handover-sessions/{sessionId}/beneficiaries/{beneficiaryId}/confirmation`:
  Staff ghi nhận xác nhận kèm `reference`; không nhận actor, thời gian hoặc status từ client.
- Response dự kiến: UUID session/Beneficiary, `status`, `confirmedAt`,
  UUID `confirmedBy`, `reference`. `PENDING` có các trường xác nhận null.
- Scope được lấy từ approval mà session tham chiếu. Beneficiary ngoài scope hoặc
  session không thuộc quyền truy cập không được phép ghi nhận.
- Lưu confirmation và audit cùng transaction; audit lỗi phải rollback.
- Không giải mã Asset hoặc thay đổi delivery/approval/Vault state khi xác nhận.

Các điểm phải chốt trước khi mở endpoint:

1. Có bắt buộc mọi Asset của chính Beneficiary đã Delivered trước khi xác nhận không?
   Jira chỉ cấm auto-confirm, chưa quy định rõ điều kiện này.
2. Loại và giới hạn của reference: mã biên nhận, tham chiếu file, hay loại khác;
   có cần ràng buộc với signed receipt PS-61 không?
3. Idempotency: xác nhận lặp cùng reference trả kết quả cũ; reference khác sau
   CONFIRMED bị chặn hay cần workflow sửa sai riêng?
4. Staff nào được đọc/ghi sau reassignment; lịch sử đọc sau session/case đóng.
5. Khóa dùng chung với close: đề xuất Vault → Case → Session → Confirmation;
   cần thống nhất với PS-60/65/70/71/72 trước khi áp dụng.
6. Hiệu lực confirmation khi approval bị vô hiệu hóa; không tự chuyển confirmation
   của approval/session cũ sang scope mới.

## Kiểm thử cần có khi triển khai

- Pending recipient hiển thị đúng theo approved scope; không lẫn recipient khác session.
- Delivery không tự tạo confirmation; một Beneficiary confirmed không xác nhận người khác.
- Sai role, sai Staff/case/vault, ngoài scope, session đóng và approval hết hiệu lực bị chặn.
- Actor lấy từ principal và thời gian từ server; không chấp nhận client giả mạo metadata.
- Validation reference theo contract đã chốt; không ghi dữ liệu bí mật vào audit/log.
- Lặp request, hai request đồng thời và reference xung đột theo quy tắc idempotency đã chốt.
- SQL Server: unique constraint phù hợp, khóa/refresh chống stale state và race với close.
- Audit lỗi rollback confirmation; lỗi persistence không để lại trạng thái xác nhận một phần.
- API/security/error vi/en và OpenAPI nhất quán.

## Phần chuẩn bị đã triển khai

`handover.policy.BeneficiaryConfirmation` là value model độc lập, chưa gắn JPA/Spring/API:
PENDING không chứa evidence; CONFIRMED bắt buộc actor/time/reference không rỗng.
Session và Beneficiary dùng UUID; diagnostic `toString()` không in reference.
Unit test kiểm tra evidence không đầy đủ, identity thiếu, pending độc lập giữa người nhận
và không lộ reference trong diagnostic output.

Không bind trực tiếp record này với request body: actor/time phải do server xác định.
Không có method nhận delivery để chuyển thành CONFIRMED. Idempotency, validation length,
authorization và policy chuyển trạng thái vẫn thuộc use case tích hợp sau khi chốt contract.

PS-67 đang ở **hàng chờ dependency**, chưa hoàn thành. Chưa có migration, endpoint hoặc
kiểm thử tích hợp SQL cho reconciliation; cần tích hợp và chạy kiểm thử sau khi dependency
được thống nhất. Không chuyển Jira Done. Trước khi tiếp tục, xác minh PS-57–66 và hỏi người dùng.
