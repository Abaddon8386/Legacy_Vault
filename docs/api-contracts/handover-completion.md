> **PS-102, 20/10/2026:** [COURT-only](court-only.md) applies to new handover operations. Legacy NOTARIAL remains read-only; current court validation, exact allocation approval and counter guards are mandatory.

# Handover reconciliation and completion — PS-67–72

Validation status: code + unit/API tests, **chưa chứng nhận SQL integration**.
V25 từ PS-61 thiếu GO trước CREATE TRIGGER, chặn fresh Flyway. Người dùng yêu cầu
giữ nguyên V25 và chờ Long sửa. Không repair/checksum/reset DB hiện hữu.

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

## PS-68–70 — Completion gates

- GET /asset-completion: completed/total/pending/complete theo distinct Asset.
  Asset nhiều người nhận chỉ được tính complete khi mọi allocation APPROVED đã delivered.
- GET /beneficiary-completion: distinct Beneficiary trong approved scope, chỉ đếm
  confirmation cùng session/version/scope hash và identity còn VERIFIED_AT_COUNTER.
  Người chưa verified vẫn nằm trong mẫu số.
- GET /completion-progress: hai vế được đọc trong cùng transaction/snapshot có khóa;
  ready chỉ khi cả hai đủ. Không làm tròn phần trăm, 0/0 không coi hoàn tất.
- requireReady được gọi lại trong transaction close/archive; không tin progress
  hoặc flags do client gửi. Pending trả 409 HANDOVER_COMPLETION_PENDING.

## PS-71 — Close, then Staff receipt

- POST /close: recheck approval, scope, dual gate dưới khóa; session OPEN → COMPLETED,
  ghi proof V29 và audit HANDOVER_SESSION_COMPLETED cùng transaction.
- Proof bất biến chứa session/version/file hash/scope hash, counts, actor/time.
  Retry cùng snapshot không thêm audit hoặc thay closedAt; status COMPLETED không có
  proof hoặc proof khác snapshot không được coi là đóng hợp lệ.
- Receipt PS-61 chỉ được ghi sau close có proof khớp current approval. Receipt vẫn
  là STAFF_ATTESTATION, không phải chữ ký số hoặc xác nhận tự động của Beneficiary.
- Các mutation delivery/confirmation/cancel đều yêu cầu OPEN, nên bị chặn sau close.

## PS-72 — Atomic archive and case close

- POST /archive: session phải COMPLETED có proof, current approval còn hiệu lực,
  dual gate vẫn đủ; receipt không bị supersede phải bao phủ mọi approved allocation.
- Flush case OPEN → CLOSED trước, rồi Vault HANDOVER_IN_PROGRESS → ARCHIVED,
  cùng transaction và audit VAULT_HANDOVER_ARCHIVED. Audit lỗi rollback cả hai.
- Retry archive xác minh đúng Staff/case/session và completion proof rồi trả state/time
  đã lưu, không thêm audit. Không mở lại hoặc xóa dữ liệu.
- V30 chỉ chặn UPDATE/DELETE của nội dung thuộc Vault ARCHIVED. Không có INSERT
  trigger vì Hibernate lấy identity bằng OUTPUT INSERTED. INSERT phải qua service:
  giữ khóa Vault/case trong transaction, refresh state rồi kiểm tra ACTIVE/case OPEN
  trước khi lưu, kể cả request bắt đầu trước archive. Direct SQL INSERT không có
  bảo vệ archive của service và không phải write API được hỗ trợ.
  Trigger error 51300 map theo numeric code thành VAULT_NOT_EDITABLE.
  Giữ audit INSERT và account-level operations; giữ rule một Vault/Owner trọn đời.
- Staff listCases nhận filter CLOSED; session và receipt history GET tiếp tục kiểm tra
  quyền và đọc được sau archive. Progress/confirmation endpoints yêu cầu workflow
  hiện hành nên trả conflict sau archive; đọc lịch sử qua session/receipt endpoints.

Các nhánh/PR tích hợp phụ thuộc tuần tự PS-67 → PS-68 → PS-69 → PS-70 → PS-71 → PS-72,
đều target develop. Chỉ rebase các nhánh hiện có, không merge hoặc tạo PR mới.
