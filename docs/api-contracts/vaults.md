# Vault — PS-12, PS-14 (ST-02), PS-33 (ST-08)

Trạng thái: **contract đã chốt**. Quyền: `VAULT_OWNER`. Ownership do **backend** kiểm tra (không dựa vào FE).

## POST /api/v1/vaults — PS-12

- **Request:**

  | Trường | Kiểu | Bắt buộc | Validation |
  |---|---|---|---|
  | `name` | string | ✔ | không rỗng, ≤ 150 |
  | `description` | string | – | ≤ 1000 |

  ```json
  { "name": "Kho di sản gia đình", "description": "Tài sản số của gia đình" }
  ```
  Mọi trường khác (đặc biệt `ownerId`, `status`) **bị bỏ qua**: chủ sở hữu lấy từ Security Context.
- **Response 201** (+ `Location: /api/v1/vaults/{id}`):
  ```json
  { "id": "9c1f0b6e-…", "name": "Kho di sản gia đình", "description": "Tài sản số của gia đình",
    "status": "ACTIVE", "createdAt": "2026-10-08T10:00:00Z", "updatedAt": "2026-10-08T10:00:00Z" }
  ```
- **Lỗi:** `400 VALIDATION_FAILED` · `401` · `403` · `409 VAULT_ALREADY_EXISTS` (mỗi Owner chỉ một Vault — A4, nhóm đã xác nhận 2026-10-12).
- **Nghiệp vụ:** Vault mới `ACTIVE` (PS-12, D-API-12; ma trận trạng thái Main Flow ghi `DRAFT → ACTIVE`, đã báo nhóm trưởng để đồng bộ tài liệu). Chưa được "đủ điều kiện" — việc có
  ≥ 1 Beneficiary kiểm ở PS-21.
- **Audit:** `VAULT_CREATED`.

### PS-77 — một kho trong suốt vòng đời

Một Owner chỉ từng tạo thành công một Vault. Giữ hàng Vault và unique Owner bất kể status;
không hard-delete hoặc chuyển Owner để tạo lại. Tạo và audit thất bại được rollback, không tiêu hao quyền tạo.
Hai request tạo đầu tiên đồng thời: một 201, một 409 `VAULT_ALREADY_EXISTS`. Đổi/hết hạn gói không cấp lại quyền tạo.
Không bổ sung API đóng/archive/soft-delete trong thay đổi này. Xem [subscriptions.md](subscriptions.md).

## GET /api/v1/vaults/{vaultId} — PS-14

- **Ownership:** chỉ chủ Vault. **Response 200:** `VaultResponse` như trên.
- **Lỗi:** `401` · `403` (không có role) · `404 RESOURCE_NOT_FOUND` — cả khi Vault **không tồn tại** lẫn khi **của người khác**
  (D-API-07). `400 MALFORMED_REQUEST` nếu `vaultId` không phải UUID.

## GET /api/v1/vaults — **[D-API-23]**

- Trả các Vault của người đăng nhập, phân trang (`page`, `size`, `sort` — D-API-06).
- **Response 200:** `{ "content": [VaultResponse…], "page": 0, "size": 20, "totalElements": 1, "totalPages": 1 }`.

## Quy tắc ownership (áp dụng cho `/vaults/{vaultId}/**`)

1. Service nhận `ownerId` từ Security Context, **không** từ request.
2. Truy vấn luôn theo cặp `(vaultId, ownerId)`; không tìm theo `vaultId` rồi so sánh sau.
3. Không phải chủ → `404`, tránh lộ tồn tại. Người gọi không có role `VAULT_OWNER` → `403`.
4. Có test: chủ xem được; người dùng khác bị chặn (cùng response như "không tồn tại").

## Test bám contract

Tạo thành công (ownership đúng, `ownerId` client bị bỏ qua) · validation · 401 · 403 · xem Vault của mình · xem Vault người khác → 404 ·
audit được ghi.


## POST /api/v1/vaults/{vaultId}/cancel-alert — PS-33 (ST-08 / LV-OWN-001)

- **Quyền:** `ROLE_VAULT_OWNER`; Owner được lấy từ Security Context/principal, không nhận `ownerId` từ client.
- **Request:** không có body.
- **Điều kiện:** Vault thuộc Owner và có `vaults.status = AWAITING_VERIFICATION`; DMS của cùng Owner phải có `dms_configs.status = GRACE_PERIOD_EXCEEDED`. `TRIGGERED` là trạng thái trước khi Grace Period kết thúc và không đủ điều kiện cho endpoint này.
- **Thành công 200:** trả `VaultResponse` với Vault `ACTIVE`. DMS trở về `MONITORING`; tính lại `nextCheckAt = now + checkIntervalDays`; đặt `lastCheckInAt = now` theo quyết định triển khai; xóa `triggeredAt` và `graceDeadline`.
- **Hủy intake:** các bản ghi `verification_cases` đang `OPEN` chuyển sang `CANCELLED`, đặt `closedAt`; các case đã ở trạng thái khác được giữ nguyên. Không xóa case, hồ sơ, chứng cứ hoặc audit history. Nếu workflow thực tế có thêm trạng thái intake chưa hoàn tất ngoài `OPEN`, phải cập nhật quy tắc và test tương ứng trước khi mở rộng điều kiện hủy.
- **Audit:** ghi `VAULT_ALERT_CANCELLED`, gồm trạng thái Vault trước/sau, trạng thái DMS trước/sau và số case `OPEN` đã hủy. Audit được ghi trong cùng transaction.
- **Lỗi:** `401`, `403`, `404 RESOURCE_NOT_FOUND` nếu Vault không tồn tại/không thuộc Owner, `409 ALERT_NOT_CANCELLABLE` nếu Vault hoặc DMS không ở trạng thái cho phép.
- **Atomicity/concurrency:** cập nhật Vault, DMS, verification cases và audit trong một transaction; khóa các bản ghi liên quan để tránh xung đột với scheduler. Lỗi làm rollback toàn bộ thay đổi nghiệp vụ.
- **An toàn:** hủy alert không xác nhận tử vong, không mở khóa Vault và không giải mã tài sản.
