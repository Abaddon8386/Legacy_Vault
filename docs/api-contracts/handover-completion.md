# Handover reconciliation and completion — PS-67–72

Baseline dependency: develop e9ea7f0, có PS-57–66. Các endpoint dưới đây yêu cầu
STAFF_EXECUTOR, đúng Staff được gán cho case/session. ID công khai là UUID.

## PS-67 — Separate recipient confirmation

Base: /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}

- GET /beneficiary-confirmations trả PENDING hoặc CONFIRMED cho từng Beneficiary
  trong toàn bộ approved scope hiện hành. Không dùng eligible-assets để tính scope
  vì resolver đó lọc người chưa verified, làm sai mẫu số.
- POST /beneficiaries/{beneficiaryId}/confirmation nhận receiptReference (1–200 ký tự,
  không blank); trả 200, actor/time do server xác định, thời gian UTC có Z.
- Người nhận phải VERIFIED_AT_COUNTER và mọi allocation được duyệt của người đó
  đã có delivery. Đây là ghi nhận riêng sau bàn giao, không tự confirm từ delivery.
- Khóa Vault → case → dossier → session, kiểm tra approval version/hash/scope
  qua LegalWorkflowGuard, refresh session sau khóa. Case OPEN, session OPEN,
  Vault UNLOCKED/HANDOVER_IN_PROGRESS; hold/stale/rejected approval chặn riêng.
- V28 lưu bằng chứng bất biến, unique theo session/version/scope hash/Beneficiary.
  Retry cùng reference trả kết quả cũ, không đổi actor/time/audit; reference khác
  trả 409 HANDOVER_CONFIRMATION_CONFLICT. Còn delivery pending trả
  409 HANDOVER_CONFIRMATION_PENDING_DELIVERY.
- Delivery của cùng allocation ở phiên trước vẫn là bằng chứng giao theo PS-65;
  confirmation của phiên/version/scope khác không được dùng cho phiên hiện tại.
- Audit BENEFICIARY_HANDOVER_CONFIRMED cùng transaction; không ghi reference,
  nội dung tài sản hoặc giấy tờ vào audit/log.

Các giới hạn reference và retry là lựa chọn contract triển khai PS-67, chưa phải
biên bản phê duyệt nghiệp vụ của nhóm. Không thêm workflow sửa/hủy confirmation;
giữ mọi bằng chứng cũ khi scope thay đổi.
