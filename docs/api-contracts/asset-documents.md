# Tài liệu PDF/Word đính kèm tài sản — PS-114 (ST-02; SWP bug #21)

**Trạng thái:** đã triển khai. Chính sách file ở [D-API-43](open-decisions.md) là **đề xuất, chờ nhóm xác nhận**.

## 1. Mục đích và ranh giới

Owner đính kèm tài liệu (PDF, Word) vào tài sản `TEXT` hoặc `CREDENTIAL` của mình và đọc lại khi cần. Đây là một nhóm riêng:

- **Không phải di chúc.** Di chúc là Asset loại `DOCUMENT` có phiên bản (`/wills`). Một di chúc không bao giờ là đích đính kèm (404).
- **Không phải chứng cứ Staff.** Tệp của Staff/Legal (giấy tử vong, di chúc giấy gốc, văn bản căn cứ) nằm ở [intake-attachments.md](intake-attachments.md).
- **Không phải ảnh tài sản** ([lifetime-plans-and-asset-images.md](lifetime-plans-and-asset-images.md)): bảng, giới hạn và định dạng khác.
- Tài liệu **không chiếm chỗ trong số tài sản**; dung lượng của nó **tính vào hạn mức lưu trữ** của gói (cùng cách đếm với payload, ảnh và phiên bản di chúc, xem [assets.md](assets.md)).

## 2. Endpoint

Chỉ Owner của Vault: thiếu role `403`, chưa đăng nhập `401`, Vault/tài sản của người khác hoặc không tồn tại `404`. Mọi ID là UUID công khai.

| Method | Đường dẫn | Mô tả |
|---|---|---|
| `GET` | `/api/v1/vaults/{vaultId}/assets/{assetId}/documents` | Liệt kê metadata (không nội dung) |
| `POST` | `/api/v1/vaults/{vaultId}/assets/{assetId}/documents` | Đính kèm một hoặc nhiều tệp (`multipart/form-data`, phần `documents`) |
| `POST` | `/api/v1/vaults/{vaultId}/assets/{assetId}/documents/{documentId}/download` | Đọc nội dung, body `{ "password": "…" }` |
| `DELETE` | `/api/v1/vaults/{vaultId}/assets/{assetId}/documents/{documentId}` | Xóa, giải phóng dung lượng (`204`) |

Metadata: `{ "id", "fileName", "contentType", "sizeBytes", "sha256", "createdAt" }`.

## 3. Tải lên

- **Định dạng (kiểm tra theo nội dung, không tin tên hay Content-Type khai báo):** PDF (`%PDF-`), Word 2007+ `.docx` (ZIP có `[Content_Types].xml` và `word/document.xml`), Word cũ `.doc` (OLE2 có luồng `WordDocument`).
- **Bị từ chối (`415`):** tệp có macro (`.docm`, `vbaProject.bin`, `_VBA_PROJECT` trong `.doc`), ActiveX, Excel/PowerPoint/ZIP khác, đường dẫn thoát (`..`), ZIP bom (quá 5.000 mục hoặc 200 MiB sau giải nén), tệp hỏng, Content-Type khai báo mâu thuẫn với nội dung.
- Rỗng hoặc thiếu phần `documents`: `400`. Vượt `legacyvault.asset-documents.max-file-bytes` (mặc định 10 MiB): `413`.
- Tối đa `legacyvault.asset-documents.max-per-asset` (mặc định 5) tài liệu mỗi tài sản, vượt: `409 ASSET_DOCUMENT_LIMIT_EXCEEDED`.
- **Nguyên tử:** mọi tệp của một request được lưu hoặc không tệp nào; tệp sai, vượt giới hạn hay vượt hạn mức đều rollback cả request.
- **Hạn mức lưu trữ:** kiểm tra và ghi trong cùng giao dịch dưới khóa Owner. Vượt hạn mức gói: `409 STORAGE_QUOTA_EXCEEDED`; tệp lớn hơn giới hạn từng tệp của gói: `413`.
- Chỉ khi Vault `ACTIVE` (đóng băng: `409 VAULT_NOT_EDITABLE`).
- Server tính SHA-256 của byte gốc, mã hóa AES-256-GCM (AAD gồm ID tài sản và ID tài liệu). Tên tệp chỉ để hiển thị (đã làm sạch).

## 4. Đọc nội dung

`POST …/download` với mật khẩu đăng nhập hiện tại, dùng chung cơ chế và bộ đếm thử sai với `reveal` và ảnh (sai: `403 REAUTH_FAILED`; quá giới hạn: `429`). Thứ tự: ownership (404) → trạng thái Vault (409) → tệp (404) → mật khẩu.

Response là byte đã giải mã với đúng Content-Type, luôn `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Content-Security-Policy: default-src 'none'; sandbox`. FE xem trước bằng cách tải về blob, không lưu vào `localStorage`/log. Server không bao giờ mở hay thực thi nội dung tài liệu.

## 5. Audit

`ASSET_DOCUMENT_ADDED` (kèm ID, loại, kích thước, SHA-256), `ASSET_DOCUMENT_OPENED`, `ASSET_DOCUMENT_REMOVED`, mỗi lần nhập sai mật khẩu `REAUTH_FAILED`. Audit **không** ghi tên tệp hay nội dung.

## 6. Giới hạn đã biết

- Chưa có xem trước phía server và chưa quét virus/mã độc ngoài kiểm tra cấu trúc; PDF vẫn có thể chứa script, nên FE chỉ tải về blob và không nhúng.
- Chưa có quy tắc lưu trữ/xóa tự động (retention). Xóa là thao tác của Owner khi Vault `ACTIVE`.
- Tài liệu của tài sản chưa nằm trong phạm vi bàn giao cho Beneficiary (bàn giao theo tài sản được duyệt vẫn chỉ dùng payload tài sản).
