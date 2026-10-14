# Asset — PS-15, PS-16 (ST-02)

Trạng thái: **contract đã chốt**. Quyền: `VAULT_OWNER` + sở hữu Vault. Tạo Asset **chưa phải** bàn giao (không có trường/trạng thái handover).

## Mô hình

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID | |
| `vaultId` | UUID | bất biến |
| `name` | string ≤ 150 | |
| `assetType` | enum `TEXT` \| `CREDENTIAL` \| `FILE` | Sprint 1 chỉ `TEXT`, `CREDENTIAL` (D-API-13); bất biến sau khi tạo |
| `description` | string ≤ 1000 | tùy chọn |
| `payload` | string | **chỉ ghi (write-only)**: nội dung bí mật, mã hóa đối xứng phía server khi lưu. **Không bao giờ có trong response** |
| `hasPayload` | boolean | response: cho biết đã có nội dung |
| `createdAt`, `updatedAt` | datetime | |

Giới hạn kích thước `payload`: mặc định 64 KB, cấu hình qua property (D-API-29); vượt giới hạn → `400 VALIDATION_FAILED`.

## POST /api/v1/vaults/{vaultId}/assets — PS-15

- **Request:** `{ "name": "Mật khẩu email dự phòng", "assetType": "CREDENTIAL", "description": "…", "payload": "<bí mật>" }`
  (`name`, `assetType`, `payload` bắt buộc).
- **Response 201** (+ `Location`): `AssetResponse` (không có `payload`).
  ```json
  { "id": "1a2b3c4d-…", "vaultId": "9c1f0b6e-…", "name": "Mật khẩu email dự phòng", "assetType": "CREDENTIAL",
    "description": "…", "hasPayload": true, "createdAt": "2026-10-08T10:00:00Z", "updatedAt": "2026-10-08T10:00:00Z" }
  ```
- **Lỗi:** `400 VALIDATION_FAILED` · `401` · `403` · `404` (Vault không thuộc người gọi) · `409 VAULT_NOT_EDITABLE`.
- **Audit:** `ASSET_CREATED` (id, loại; **không** ghi `payload`).

## GET /api/v1/vaults/{vaultId}/assets — PS-15

- Phân trang (`page`, `size`, `sort`). **Response 200:** envelope với `content: [AssetResponse…]`. Chỉ metadata.
- **Lỗi:** `401` · `403` · `404`.

## GET /api/v1/vaults/{vaultId}/assets/{assetId} — PS-16

- **Response 200:** `AssetResponse`. **Lỗi:** `401` · `403` · `404` (không tồn tại, thuộc Vault khác, hoặc Vault của người khác).
- Không trả `payload`. Việc xem/giải mã nội dung là chức năng khác, **không có trong Sprint 1**.

## PATCH /api/v1/vaults/{vaultId}/assets/{assetId} — PS-16 **[D-API-24]**

- **Request:** các trường tùy chọn `name`, `description`, `payload`. Trường vắng = không đổi. **Chỉ các trường này được đổi**;
  `assetType`, `vaultId`, `id` bị bỏ qua. Body phải có ít nhất một trường hợp lệ, nếu không `400 VALIDATION_FAILED`.
- **Response 200:** `AssetResponse` đã cập nhật (`updatedAt` mới).
- **Lỗi:** `400` · `401` · `403` · `404` · `409 VAULT_NOT_EDITABLE`.
- **Audit:** `ASSET_UPDATED` (danh sách tên trường đã đổi; không ghi giá trị `payload`).

## Test bám contract

Tạo/liệt kê/xem/cập nhật thành công · validation (tên rỗng, loại sai) · `payload` không xuất hiện trong bất kỳ response nào ·
không log `payload` · ownership (Vault/Asset người khác → 404; role sai → 403) · 401 · chỉ trường hợp lệ được đổi.
