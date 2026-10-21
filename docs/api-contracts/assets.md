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

- **Request:** các trường tùy chọn `name`, `description`, `payload` và **bắt buộc `password`** (PS-111, D-API-40). Trường vắng = không
  đổi. **Chỉ các trường này được đổi**; `assetType`, `vaultId`, `id` bị bỏ qua. Body phải có ít nhất một trong ba trường dữ liệu,
  nếu không `400 VALIDATION_FAILED`.
- **`password`** (PS-111): mật khẩu đăng nhập hiện tại, không rỗng, tối đa 72 ký tự. Server tự xác thực lại trong chính request PATCH
  (cùng cơ chế và cùng bộ đếm với `reveal`); không có cờ hoặc token "đã xác nhận" do client gửi. Mọi lần sửa đều cần, kể cả khi chỉ
  đổi tên/mô tả. Thiếu hoặc rỗng: `400 VALIDATION_FAILED` (không tính là lần nhập sai).
- **Response 200:** `AssetResponse` đã cập nhật (`updatedAt` mới). Không trả lại `password` hay `payload`.
- **Thứ tự kiểm tra:** role (403) → ownership (404) → trạng thái Vault (409) → giới hạn/mật khẩu (429/403) → quota/ghi. Người lạ
  nhận 404 và kho đóng băng nhận 409 trước khi mật khẩu bị kiểm tra nên không bị tính lần sai.
- **Lỗi:** `400` · `401` · `403 ACCESS_DENIED` (thiếu role) · `403 REAUTH_FAILED` (sai mật khẩu; không dùng 401) · `404` ·
  `409 VAULT_NOT_EDITABLE` · `429 TOO_MANY_ATTEMPTS` (quá `legacyvault.reauth.max-failed-attempts` lần sai trong
  `legacyvault.reauth.window-minutes` phút, kể cả khi lần sau đúng).
- **Audit:** `ASSET_UPDATED` (danh sách tên trường đã đổi; không ghi giá trị `payload` hay mật khẩu); mỗi lần sai ghi `REAUTH_FAILED`
  trong giao dịch riêng nên vẫn được lưu khi request bị từ chối.
- **Tương thích:** client cũ gửi PATCH không có `password` nhận `400`. FE (PR #141) gửi `password` trong body PATCH thay cho bước xác
  thực riêng; không lưu mật khẩu vào `localStorage`/log.

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

## Quota nội dung — PS-77, PS-92 (D-API-42)

**Mặc định bật** (D-API-42, đề xuất chờ nhóm xác nhận): giới hạn của gói hiện hành (BASIC 5 / STANDARD 50 / EXTENDED 200 tài sản;
100 MiB / 1 GiB / 5 GiB nội dung) được thực thi cho mọi thao tác ghi của Owner. Cờ `legacyvault.subscription.quota-enforcement-enabled`
(biến môi trường `QUOTA_ENFORCEMENT_ENABLED`) chỉ là công tắc vận hành để tắt khi cần. Giới hạn payload/upload sẵn có và guard
quyền/trạng thái vẫn có hiệu lực.

- **Cách đếm số tài sản:** mọi Asset còn lưu của mọi Vault của Owner, **kể cả di chúc** (Asset loại `DOCUMENT`). Mỗi di chúc chiếm một chỗ;
  thêm phiên bản mới cho cùng một di chúc **không** chiếm thêm chỗ. Owner BASIC có 1 di chúc chỉ tạo thêm được 4 tài sản.
- **Cách đếm dung lượng:** byte payload UTF-8 của Asset + mọi phiên bản file di chúc còn lưu + mọi ảnh đính kèm Asset + mọi tài liệu PDF/Word đính kèm Asset ([asset-documents.md](asset-documents.md), PS-114) (đơn vị nhị phân).
- Tạo Asset tăng một đơn vị count và số byte payload; thay payload tính chênh lệch byte; thêm ảnh/phiên bản di chúc chỉ tăng byte.
- 409 `ASSET_QUOTA_EXCEEDED` / `STORAGE_QUOTA_EXCEEDED` (shared ApiError, vi/en). Kiểm tra và ghi cùng một giao dịch dưới khóa Owner
  nên các request đồng thời không thể vượt giới hạn.
- **Owner đang vượt giới hạn (dữ liệu cũ):** vẫn đọc, sửa không tăng usage (đổi tên, mô tả, thu nhỏ payload) và xóa ảnh; mọi thao tác tăng
  count hoặc byte bị 409. `GET /subscriptions/me` trả `overQuota`. Không có dữ liệu nào bị xóa hay sửa tự động.
- `GET /subscriptions/me` → `usage` có `assetCount` (số được tính vào giới hạn, gồm di chúc), `willCount` và `assetOnlyCount`
  (= `assetCount - willCount`, số tài sản Owner thấy trong danh sách). FE nên hiển thị "tài sản + di chúc" để số liệu khớp giới hạn.
- Không tăng usage vẫn phải thỏa ownership/trạng thái. Chi tiết: [subscriptions.md](subscriptions.md).
