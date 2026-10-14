# Vault — PS-12, PS-14 (ST-02)

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
