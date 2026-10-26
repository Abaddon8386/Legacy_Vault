# Tài sản đã nhận của tài khoản Beneficiary — PS-104 (ST-25, ST-26, LV-HANDOVER-001; AC-L08)

**Trạng thái:** đã triển khai. Các quyết định thiết kế ở [D-API-44](open-decisions.md) là **đề xuất, chờ nhóm xác nhận**.

## 1. Mục đích và ranh giới

Sau khi Staff giao tài sản trực tiếp tại quầy ([handover-deliveries.md](handover-deliveries.md)) và người nhận có tài khoản
(PS-62/63/87), tài khoản đó cần **xem lại** đúng phần mình đã nhận, kể cả sau khi hồ sơ được lưu trữ. FE PS-105 ("Shared with me")
dùng các API này.

Quyền đọc là giao của ba dữ kiện lấy từ server: **tài khoản đang đăng nhập** (principal) ∧ **bản ghi Beneficiary liên kết với
tài khoản đó** ∧ **mục bàn giao của Beneficiary đó đã được Staff ghi nhận `DELIVERED`** (hoặc sau này `VERIFIED_BY_BENEFICIARY`).
Ngoài ra không đọc được gì:

- không thấy toàn kho, kho khác, người nhận khác;
- không thấy tài sản đã phân bổ nhưng **chưa giao** (kể cả khi Legal đã duyệt);
- không có `recipientId`, `vaultId` hay `accountId` trong đường dẫn hoặc body: không thể đổi sang người khác (IDOR).

Mục đã giao là **lịch sử**: vẫn đọc được khi kho `ARCHIVED` hoặc `ON_HOLD`; hệ thống không tự thu hồi. Một tài khoản có thể nhận từ nhiều kho.
Mã hay email chỉ liên kết tài khoản, không tự mở tài sản.

## 2. Endpoint

Chỉ role `BENEFICIARY`: role khác `403`, chưa đăng nhập `401`. Mục không thuộc tài khoản (hoặc chưa giao, hoặc không tồn tại) luôn `404`.
Mọi response có `Cache-Control: no-store`.

| Method | Đường dẫn | Mô tả |
|---|---|---|
| `GET` | `/api/v1/received-assets?page=0&size=20` | Danh sách mục đã nhận, mới giao trước (`size` 1–100) |
| `GET` | `/api/v1/received-assets/{itemId}` | Chi tiết một mục (metadata, không nội dung) |
| `GET` | `/api/v1/received-assets/{itemId}/images` | Metadata ảnh của tài sản |
| `POST` | `/api/v1/received-assets/{itemId}/content` | Nội dung giải mã của tài sản, body `{ "password": "…" }` |
| `POST` | `/api/v1/received-assets/{itemId}/images/{imageId}/download` | Byte ảnh, body `{ "password": "…" }` |

`itemId` là ID công khai của mục bàn giao. Item:

```json
{ "itemId": "uuid", "assetId": "uuid", "vaultId": "uuid", "vaultName": "Kho di sản gia đình", "name": "Email",
  "assetType": "CREDENTIAL", "description": null, "allocationNote": "Phần theo bản án", "deliveredAt": "2026-10-21T10:00:00Z",
  "status": "DELIVERED", "imageCount": 1, "hasContent": true }
```

`vaultId`/`vaultName` cho biết kho nguồn khi nhận từ nhiều nguồn. `allocationNote` là ghi chú của dòng phân bổ đã duyệt (có thể `null`).
Danh sách và chi tiết **không bao giờ** chứa nội dung tài sản, mật khẩu hay khóa.

## 3. Đọc nội dung và ảnh

- Cần **mật khẩu đăng nhập hiện tại**, dùng chung cơ chế và bộ đếm thử sai với `reveal` và ảnh của Owner: sai `403 REAUTH_FAILED` (không phải 401),
  quá giới hạn `429 TOO_MANY_ATTEMPTS`. Thứ tự: quyền sở hữu mục (404) → mật khẩu.
- `content` trả `{ "itemId", "assetId", "payload" }` (nội dung giải mã, không bao giờ được cache hoặc ghi log). Tài sản không có nội dung: `404`.
- Ảnh trả byte với đúng Content-Type, `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`.
  FE xem trước bằng blob trong bộ nhớ, thu hồi khi đóng.
- Audit `RECEIVED_ASSET_OPENED` và `RECEIVED_ASSET_IMAGE_OPENED` (actor, kho, mục bàn giao; **không** ghi nội dung); mỗi lần nhập sai ghi `REAUTH_FAILED`.

## 4. Giới hạn đã biết

- Chưa có đọc **tài liệu PDF/Word** đính kèm (PS-114) cho người nhận; chỉ nội dung và ảnh.
- Chưa có API đánh dấu "đã xem" hay xác nhận nhận hàng từ phía tài khoản (xác nhận vẫn là bước tại quầy, ST-26).
- Chưa chặn đọc khi một tranh chấp mới phát sinh sau khi đã giao (chính sách: giữ lịch sử đã giao, xem D-API-44).
- Tài khoản bị khóa hoặc bị xóa mềm không gọi được (bộ lọc JWT đọc lại trạng thái từ DB mỗi request).
