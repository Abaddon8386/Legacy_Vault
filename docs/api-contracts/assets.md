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
- Không trả `payload`. Muốn xem nội dung: `POST .../{assetId}/reveal` bên dưới (D-API-32).

## PATCH /api/v1/vaults/{vaultId}/assets/{assetId} — PS-16 **[D-API-24]**

- **Request:** các trường tùy chọn `name`, `description`, `payload`. Trường vắng = không đổi. **Chỉ các trường này được đổi**;
  `assetType`, `vaultId`, `id` bị bỏ qua. Body phải có ít nhất một trường hợp lệ, nếu không `400 VALIDATION_FAILED`.
- **Response 200:** `AssetResponse` đã cập nhật (`updatedAt` mới).
- **Lỗi:** `400` · `401` · `403` · `404` · `409 VAULT_NOT_EDITABLE`.
- **Audit:** `ASSET_UPDATED` (danh sách tên trường đã đổi; không ghi giá trị `payload`).

## POST /api/v1/vaults/{vaultId}/assets/{assetId}/reveal — PS-16 **[D-API-32]**

Owner xem lại nội dung bảo mật (`payload`) của chính mình sau khi **nhập lại mật khẩu đăng nhập hiện tại**. Dùng `POST`
vì mật khẩu nằm trong body (không đưa vào URL/log); không thay đổi dữ liệu.

- **Request:** `{ "password": "<mật khẩu đăng nhập hiện tại>" }` — bắt buộc, không rỗng, tối đa 72 ký tự.
- **Response 200:** `{ "id": "<assetId>", "payload": "<nội dung>" }` với `Cache-Control: no-store`.
  `payload` **chỉ** xuất hiện ở endpoint này; mọi response khác của Asset vẫn không có.
- **Điều kiện:** Owner của Vault, Vault ở `ACTIVE` (đóng băng sau Grace Period thì không còn xem được qua đường này,
  LV-OWN-001/LV-DEATH-001), Asset có `payload`.
- **Thứ tự kiểm tra:** role (403) → ownership (404) → trạng thái Vault (409) → giới hạn/mật khẩu (429/403). Người lạ luôn
  nhận 404 nên không dò được Asset bằng endpoint này.
- **Lỗi:** `400` · `401` · `403 ACCESS_DENIED` (thiếu role) · `403 REAUTH_FAILED` (sai mật khẩu; **không** dùng 401 để FE
  không coi là hết phiên) · `404` · `409 VAULT_NOT_EDITABLE` · `429 TOO_MANY_ATTEMPTS`.
- **Giới hạn thử:** quá `legacyvault.reauth.max-failed-attempts` lần sai (mặc định 5) trong `legacyvault.reauth.window-minutes`
  phút (mặc định 15) → `429`, kể cả khi lần sau nhập đúng. Đếm theo từng người dùng, dùng chung giữa mọi Asset/di chúc.
  **Giá trị mặc định là đề xuất, chờ nhóm xác nhận.**
- **Audit:** `ASSET_REVEALED` (ST-02; loại Asset, **không** ghi nội dung, **không** ghi mật khẩu); mỗi lần sai ghi
  `REAUTH_FAILED` trong giao dịch riêng nên vẫn được lưu khi request bị từ chối.
- **FE:** không lưu `payload` hay mật khẩu vào `localStorage`/log; xóa khỏi bộ nhớ khi đóng màn hình xem.

## Test bám contract

Tạo/liệt kê/xem/cập nhật thành công · validation (tên rỗng, loại sai) · `payload` không xuất hiện trong bất kỳ response nào ·
không log `payload` hay mật khẩu · `reveal`: đúng mật khẩu trả `payload`, sai → 403, vượt giới hạn → 429, kho đóng băng → 409 · ownership (Vault/Asset người khác → 404; role sai → 403) · 401 · chỉ trường hợp lệ được đổi.
