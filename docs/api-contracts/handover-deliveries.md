> **PS-102, 20/10/2026:** [COURT-only](court-only.md) applies to new handover operations. Legacy NOTARIAL remains read-only; current court validation, exact allocation approval and counter guards are mandatory.

# Bàn giao tài sản tại quầy — PS-64, PS-65, PS-66 (ST-25, LV-HANDOVER-001)

**Trạng thái:** đã triển khai. Các quyết định thiết kế ghi ở [D-API-38](open-decisions.md); đó là cách đọc Main Flow v4.2 và chờ nhóm xác nhận.

## 1. Mô hình

ST-25: Staff giao **đúng người, đúng tài sản** theo căn cứ (công chứng hoặc Tòa án) mà Legal đã duyệt. Trước mỗi lần giao hệ thống kiểm tra phê duyệt còn hiệu lực
và không có hold; không bao giờ chỉ dựa vào trạng thái Vault `UNLOCKED` (AC-L07).

- **Đơn vị bàn giao** là một *dòng phân bổ* (tài sản → người nhận) đã được Legal duyệt (`APPROVED`) của **phiên bản hồ sơ hiện tại**. Danh sách Beneficiary do Owner cấu hình **không** được dùng.
- Mỗi dòng chỉ giao **một lần** (`handover_items`, khóa duy nhất theo dòng phân bổ). Phiên bản hồ sơ mới có dòng phân bổ mới; lần giao cũ giữ làm lịch sử.
- Lần giao đầu tiên chuyển Vault `UNLOCKED` → `HANDOVER_IN_PROGRESS`.
- Việc giao ghi `handover_items.status = DELIVERED`. `VERIFIED_BY_BENEFICIARY` thuộc bước đối soát của Beneficiary (ST-26, PS-67).
- Không trả nội dung hay bí mật của tài sản qua các API này.

## 2. PS-66 — Guard bàn giao tập trung (`HandoverAuthorizationGuard`)

Mọi thao tác bàn giao đi qua guard này, theo thứ tự (khóa Vault → ca → hồ sơ → phiên):

1. Ca thuộc Staff đang gọi, nếu không `404 RESOURCE_NOT_FOUND`.
2. `LegalWorkflowGuard` (loại `HANDOVER`): ca `OPEN`, không hold (`LEGAL_WORKFLOW_ON_HOLD`), hồ sơ đã chuyển và đủ phiên bản yêu cầu, bắt buộc nhánh COURT và quyết định Tòa án hợp lệ (`COURT_DECISION_REQUIRED`), phê duyệt Legal còn khớp phiên bản, hash và phạm vi (`LEGAL_DECISION_STALE`, `LEGAL_APPROVAL_REQUIRED`).
3. Vault là `UNLOCKED` hoặc `HANDOVER_IN_PROGRESS`, nếu không `409 HANDOVER_VAULT_NOT_UNLOCKED`.
4. Phiên của ca và Staff tồn tại (nếu không `404`) và đang `OPEN` (`409 HANDOVER_SESSION_INVALID_STATE`).

Từng điều kiện thất bại đều chặn riêng; guard chạy trong giao dịch của use case và giữ khóa đến khi giao dịch kết thúc.

## 3. Endpoint

Mọi ID là UUID công khai. Chỉ `STAFF_EXECUTOR`; role khác `403`, chưa đăng nhập `401`.

| Method | Đường dẫn | Mô tả |
|---|---|---|
| `GET` | `/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/eligible-assets?recipientId=` | PS-64: tài sản được phép giao (kèm trạng thái `ELIGIBLE`/`DELIVERED`). `recipientId` tùy chọn. `200` |
| `POST` | `.../handover-sessions/{sessionId}/deliveries` | PS-65: ghi nhận giao tài sản cho một người nhận. `201` + `Location` |
| `GET` | `.../handover-sessions/{sessionId}/deliveries` | PS-65: lịch sử giao của phiên, cũ nhất trước. `200` |

`POST` nhận `{ "recipientId": "uuid", "assetIds": ["uuid", ...] }` (1–100 phần tử, không trùng) và trả mảng hạng mục:
`{ itemId, sessionId, assetId, recipientId, status, deliveredAt, staffId }`.
Việc ghi là **tất cả hoặc không**: chỉ cần một tài sản không đủ điều kiện thì không ghi gì.

## 4. Lỗi

| Tình huống | HTTP | Mã lỗi |
|---|---|---|
| Body sai (thiếu người nhận, danh sách rỗng, trùng, quá 100, UUID sai) | 400 | `VALIDATION_FAILED` |
| Ca/phiên không thuộc Staff hoặc không tồn tại | 404 | `RESOURCE_NOT_FOUND` |
| Vault chưa mở khóa hợp lệ để giao | 409 | `HANDOVER_VAULT_NOT_UNLOCKED` |
| Phiên không còn `OPEN` | 409 | `HANDOVER_SESSION_INVALID_STATE` |
| Đang hold / phê duyệt không còn khớp / thiếu phê duyệt / thiếu quyết định Tòa án | 409 | `LEGAL_WORKFLOW_ON_HOLD`, `LEGAL_DECISION_STALE`, `LEGAL_APPROVAL_REQUIRED`, `COURT_DECISION_REQUIRED` |
| Người nhận ngoài phạm vi duyệt hoặc chưa `VERIFIED_AT_COUNTER` | 409 | `HANDOVER_RECIPIENT_NOT_ELIGIBLE` |
| Tài sản ngoài phạm vi được duyệt cho người nhận | 409 | `HANDOVER_ASSET_NOT_ELIGIBLE` |
| Tài sản đã được giao (kể cả tranh chấp đồng thời) | 409 | `HANDOVER_ASSET_ALREADY_DELIVERED` |

## 5. Audit, khóa và dữ liệu

- `HANDOVER_ASSET_DELIVERED` (Step `ST-25`, Rule `LV-HANDOVER-001`): ID công khai của phiên, ca, người nhận, các hạng mục, số lượng và phiên bản hồ sơ; trạng thái Vault trước/sau. Không ghi nội dung tài sản hay dữ liệu cá nhân. Ghi trong cùng giao dịch với dữ liệu giao.
- Khóa Vault → ca → hồ sơ → phiên. Chỉ mục duy nhất theo dòng phân bổ là rào chắn cuối chống giao trùng khi hai Staff cùng thao tác.
- Migration `V27__create_handover_items.sql`: bảng mới, chỉ thêm; trigger chặn xóa và chặn đổi danh tính hạng mục (phiên, dòng phân bổ, tài sản, người nhận, Staff, thời điểm).
- Vì Vault có thể ở `HANDOVER_IN_PROGRESS`, mở phiên mới (PS-60) và lập biên nhận (PS-61) chấp nhận cả `UNLOCKED` và `HANDOVER_IN_PROGRESS`.

## 6. Kiểm chứng và giới hạn

Đã có: test guard (8), resolver phạm vi (5), dịch vụ giao (9), controller (7); cả bộ test Maven chỉ `contextLoads` lỗi (cần SQL Server). Migration `V27` và khóa cạnh tranh chưa kiểm chứng trên SQL Server thật.
Giới hạn: chưa có API hủy/hoàn tác một lần giao; chưa có đối soát của Beneficiary (PS-67), cổng nghiệm thu kép (PS-70) và đóng phiên (PS-71); chuyển `UNLOCKED | HANDOVER_IN_PROGRESS → ON_HOLD` khi có tranh chấp mới chưa làm.
