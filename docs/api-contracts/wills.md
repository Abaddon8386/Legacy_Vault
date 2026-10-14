# Di chúc số hóa — PS-17, PS-18 (ST-03, LV-WILL-001)

Trạng thái: **contract đã chốt**. Quyền: `VAULT_OWNER` + sở hữu Vault.

## Nguyên tắc nghiệp vụ

- Đây là **bản số hóa** (scan/PDF/ảnh) của di chúc giấy. Upload xong trạng thái chỉ là `UPLOADED`.
- Bản số hóa **không tự động được Legal xác nhận**. API này **không bao giờ** đặt `LEGAL_APPROVED`, `WILL_VERIFICATION`
  hay bất kỳ trạng thái thẩm định nào; việc đó thuộc Legal Verifier ở giai đoạn sau (ST-15).
- File thuộc đúng Vault/Owner. Không log nội dung file; không dùng tên file do client làm đường dẫn lưu.
- **SHA-256** chỉ giúp phát hiện file có bị thay đổi hay không; **không chứng minh giá trị pháp lý** của di chúc.
- Mỗi phiên bản file có metadata toàn vẹn riêng. File đổi → hash đổi → là phiên bản mới.

## Mô hình

`WillResponse`:

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID | |
| `vaultId` | UUID | |
| `status` | enum | Sprint 1 chỉ `UPLOADED` |
| `currentVersion` | `WillVersion` | |
| `createdAt` | datetime | |

`WillVersion`:

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `version` | int ≥ 1 | tăng dần |
| `fileName` | string | tên hiển thị đã làm sạch (bỏ đường dẫn/ký tự điều khiển) |
| `contentType` | string | `application/pdf`, `image/jpeg`, `image/png` **[D-API-14]** |
| `sizeBytes` | long | ≤ 10 MB **[D-API-14]** |
| `sha256` | string | 64 ký tự hex, chữ thường |
| `uploadedAt` | datetime | |

## POST /api/v1/vaults/{vaultId}/wills — PS-17

- `Content-Type: multipart/form-data`; phần `file` (bắt buộc), phần `note` (tùy chọn, ≤ 500).
- Tạo hồ sơ di chúc mới với phiên bản 1.
- **Response 201** (+ `Location`):
  ```json
  { "id": "5d6e7f80-…", "vaultId": "9c1f0b6e-…", "status": "UPLOADED",
    "currentVersion": { "version": 1, "fileName": "di-chuc.pdf", "contentType": "application/pdf",
      "sizeBytes": 482113, "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "uploadedAt": "2026-10-08T10:00:00Z" },
    "createdAt": "2026-10-08T10:00:00Z" }
  ```
- **Lỗi:** `400 VALIDATION_FAILED` (thiếu `file`, file rỗng) · `401` · `403` · `404` · `409 VAULT_NOT_EDITABLE` ·
  `413 PAYLOAD_TOO_LARGE` · `415 UNSUPPORTED_MEDIA_TYPE`.
- Loại file được xác định từ **nội dung/magic bytes** ngoài `Content-Type` do client khai.
- **Audit:** `WILL_UPLOADED` (willId, version, sha256, kích thước; **không** ghi nội dung).

## POST /api/v1/vaults/{vaultId}/wills/{willId}/versions — PS-18

- Tải phiên bản mới của cùng di chúc. Request/response/lỗi như trên; `version` tăng thêm 1; phiên bản cũ **được giữ nguyên**.
- **Audit:** `WILL_VERSION_ADDED`.

## GET /api/v1/vaults/{vaultId}/wills — GET /api/v1/vaults/{vaultId}/wills/{willId}

- Trả metadata (`WillResponse`), không trả nội dung file (muốn mở file: `.../download` bên dưới). **Lỗi:** `401` · `403` · `404`.

## GET /api/v1/vaults/{vaultId}/wills/{willId}/versions — PS-18

- Danh sách `WillVersion` (mới nhất trước) để đối chiếu toàn vẹn.

## Ánh xạ sang database (PS-73, đã chốt 2026-10-11)

Giao diện API là "di chúc" (`/wills`), nhưng DB lưu bằng ba bảng. Service chịu trách nhiệm ánh xạ:

| Khái niệm API | Bảng DB | Ghi chú |
|---|---|---|
| Hồ sơ di chúc (`WillResponse`) | `assets` (loại `DOCUMENT`) + `legal_documents` (`document_type = 'WILL'`) | `legal_documents` gắn 1-1 với asset |
| Phiên bản file (`WillVersion`) | `asset_versions` | `version_no`, `sha256_hash`, `upload_status = 'UPLOADED'`, nội dung file mã hóa |
| Trạng thái `UPLOADED` | `asset_versions.upload_status` | **Không** lấy từ `legal_documents.verification_status` (mặc định `PENDING_VERIFICATION`, thuộc quy trình Legal) |

- Bản số hóa được tạo không đồng nghĩa Legal đã duyệt: API này không bao giờ ghi `LEGAL_APPROVED` vào `legal_documents`.
- Cột `legal_documents.document_type` (loại tài liệu: `WILL`...) là khái niệm **khác** với `legal_basis_type` của D-LEGAL-002 (`NOTARIAL_PARTITION`, `COURT_*`); D-LEGAL-002 đã được đổi tên trường để không trùng (2026-10-12).

## POST /api/v1/vaults/{vaultId}/wills/{willId}/versions/{version}/download — PS-17/PS-18 **[D-API-33]**

Owner mở/tải nội dung một phiên bản file di chúc sau khi **nhập lại mật khẩu đăng nhập hiện tại**. Dùng `POST` vì mật
khẩu nằm trong body (không đưa vào URL/log); không thay đổi dữ liệu. Thay quy tắc "chưa có API tải xuống" của D-API-14.

- **Request:** `{ "password": "<mật khẩu đăng nhập hiện tại>" }` — bắt buộc, không rỗng, tối đa 72 ký tự. `version` ≥ 1.
- **Response 200:** nội dung gốc của file (`application/pdf`, `image/jpeg`, `image/png` theo `contentType` đã lưu), kèm:
  `Content-Disposition: attachment; filename*=UTF-8''<tên đã làm sạch>`, `X-Content-Type-Options: nosniff`,
  `Cache-Control: no-store`, `Content-Length`. Luôn là `attachment` để trình duyệt không tự render; FE muốn xem trước thì
  tạo blob URL từ response.
- **Toàn vẹn:** sau khi giải mã, BE tính lại SHA-256 và so với `sha256` đã lưu lúc tải lên; lệch thì **không** trả file
  (500 `INTERNAL_ERROR`, ghi log lỗi không có nội dung).
- **Điều kiện:** Owner của Vault, Vault `ACTIVE`, đúng `willId` và `version`.
- **Thứ tự kiểm tra:** role (403) → ownership (404) → trạng thái Vault (409) → di chúc/phiên bản (404) → giới hạn/mật khẩu
  (429/403).
- **Lỗi:** `400` · `401` · `403 ACCESS_DENIED` · `403 REAUTH_FAILED` · `404` · `409 VAULT_NOT_EDITABLE` · `429 TOO_MANY_ATTEMPTS`.
  Giới hạn thử và ý nghĩa mã lỗi giống [assets.md](assets.md) (D-API-32); bộ đếm dùng chung với `reveal` của Asset.
- **Audit:** `WILL_FILE_OPENED` (ST-03, LV-WILL-001: `version`, `sha256`, `sizeBytes`, `contentType`; **không** ghi tên file,
  nội dung hay mật khẩu); mỗi lần sai ghi `REAUTH_FAILED`.
- **Không** thay đổi trạng thái: mở file không phải Legal duyệt, không tạo quyền cho ai khác (LV-DEATH-001, LV-BASIS-001).

## Test bám contract

Chấp nhận PDF/JPEG/PNG hợp lệ · từ chối loại khác (415) và quá lớn (413) · file thuộc đúng Vault (người khác → 404) ·
`status = UPLOADED` và **không** bao giờ `LEGAL_APPROVED` · SHA-256 đúng với nội dung · file khác → hash khác ·
version tăng, phiên bản cũ còn · audit có ghi · không log nội dung file · `download`: đúng mật khẩu trả đúng byte gốc,
sai → 403, vượt giới hạn → 429, kho đóng băng → 409, hash lệch → không trả file, người khác → 404.
