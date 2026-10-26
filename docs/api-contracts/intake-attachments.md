# Tệp đính kèm giấy tờ tiếp nhận và đọc file theo quyền — PS-103 (ST-11, ST-13, ST-15, ST-18; LV-DEATH-002, LV-WILL-001, LV-BASIS-001)

**Trạng thái:** đã triển khai. Chính sách file ở [D-API-41](open-decisions.md) là **đề xuất, chờ nhóm xác nhận**.

## 1. Mục đích và ranh giới

FE Staff (PS-98, PS-96) và Legal (PS-99) cần **tải lên và xem lại** file/ảnh của giấy tờ tử vong, bản di chúc giấy gốc và văn bản căn cứ
mà không dùng `evidenceReference` như một đường dẫn. PS-103 bổ sung:

- Staff đính kèm file/ảnh vào **bản ghi giấy tờ tử vong** (PS-38) và **lần nộp di chúc giấy gốc** (PS-39).
- Staff và Legal **đọc** file đính kèm đó.
- Staff và Legal **đọc file của phiên bản văn bản căn cứ** (PS-41, đã lưu mã hóa nhưng trước đây không có API đọc).

Không làm: file giấy tờ danh tính (CCCD/hộ chiếu — Staff đối chiếu trực tiếp ngoài hệ thống), OCR, eKYC, sửa hoặc xóa tệp. Đính kèm file **không
chứng minh** giấy tờ hợp lệ hay danh tính đúng; Legal vẫn thẩm định (ST-12, ST-15, ST-20).

## 2. Endpoint

Tất cả ID là UUID công khai. Staff chỉ truy cập ca được giao cho mình (ca khác, ca chưa nhận hoặc không tồn tại: `404`); thiếu role `403`;
chưa đăng nhập `401`. Legal dùng phạm vi Legal toàn cục sẵn có.

| Method | Đường dẫn | Ai | Mô tả |
|---|---|---|---|
| `POST` | `/api/v1/staff/verification-cases/{caseId}/death-documents/{recordId}/attachments` | Staff | Đính kèm file vào giấy tờ tử vong |
| `GET` | `…/death-documents/{recordId}/attachments` | Staff | Liệt kê metadata |
| `GET` | `…/death-documents/{recordId}/attachments/{attachmentId}/content` | Staff | Đọc file |
| `POST` | `/api/v1/staff/verification-cases/{caseId}/original-will-intakes/{intakeId}/attachments` | Staff | Đính kèm file vào di chúc giấy gốc |
| `GET` | `…/original-will-intakes/{intakeId}/attachments` | Staff | Liệt kê metadata |
| `GET` | `…/original-will-intakes/{intakeId}/attachments/{attachmentId}/content` | Staff | Đọc file |
| `GET` | `/api/v1/staff/verification-cases/{caseId}/basis-dossier/versions/{versionNo}/content` | Staff | Đọc file của phiên bản căn cứ |
| `GET` | `/api/v1/legal-verifications/death-documents/{deathDocumentId}/attachments[/{attachmentId}/content]` | Legal | Liệt kê / đọc file giấy tờ tử vong |
| `GET` | `/api/v1/legal-verifications/verification-cases/{caseId}/original-will-intakes/{intakeId}/attachments[/{attachmentId}/content]` | Legal | Liệt kê / đọc file di chúc giấy gốc |
| `GET` | `/api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/versions/{versionNo}/content` | Legal | Đọc file phiên bản căn cứ **đã chuyển Legal** |

## 3. Tải lên

`multipart/form-data` với một phần `file`. Chỉ khi ca còn `OPEN` (đóng/hủy: `409 VERIFICATION_CASE_NOT_OPEN`, nhưng vẫn đọc được).

- Loại file kiểm tra theo **nội dung** (PDF, JPEG, PNG), cùng cơ chế với file di chúc. Sai loại: `415`. Rỗng hoặc thiếu phần `file`: `400`. Vượt dung lượng: `413`.
- Server tính SHA-256 của byte gốc, mã hóa AES-256-GCM (AAD là ID công khai của tệp) và lưu; chỉ thêm, không sửa/xóa (trigger cấm UPDATE/DELETE).
- Nhiều trang/ảnh: gửi nhiều lần. Mỗi bản ghi tối đa `legacyvault.intake.max-attachments-per-record` tệp, vượt: `409 INTAKE_ATTACHMENT_LIMIT_EXCEEDED`.
- Dung lượng tối đa `legacyvault.intake.max-file-bytes` (mặc định 10 MB; giới hạn servlet `spring.servlet.multipart` phải ≥ giá trị này).

Response `201` (metadata, không có nội dung):

```json
{ "id": "uuid", "caseId": "uuid", "subjectType": "DEATH_DOCUMENT", "subjectId": "uuid", "fileName": "so-khai-tu.pdf",
  "contentType": "application/pdf", "sizeBytes": 1234, "sha256": "…64 hex…", "uploadedBy": "uuid", "uploadedAt": "2026-10-21T10:00:00Z" }
```

## 4. Đọc file

Response là byte đã giải mã, **luôn** `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`,
`Content-Security-Policy: default-src 'none'; sandbox`. FE xem trước bằng cách tải về blob; không lưu vào `localStorage`/log.

- Mỗi lần đọc nội dung ghi audit `EVIDENCE_FILE_READ` (actor, ca, ID tệp; **không** tên file, nội dung hay số giấy tờ).
- Legal chỉ đọc được phiên bản căn cứ đã **FORWARDED** (ST-19); bản nháp chưa chuyển là `404`.
- `versionNo` < 1: `400`; phiên bản không tồn tại hoặc không có file: `404`.

## 5. Giới hạn đã biết

- Chưa chặn đính kèm thêm sau khi Legal đã quyết định cho giấy tờ đó; mỗi tệp có `uploadedAt` để đối chiếu. Đề xuất chặn nằm ở D-API-41.
- Không có quota theo gói Owner cho các tệp này (chứng cứ nghiệp vụ, không phải tài sản của Owner).
- Chưa có chính sách lưu trữ/xóa (retention) cho tệp; tệp giữ cùng vòng đời hồ sơ.
- Scan giấy ký nhận bàn giao chưa có contract riêng; không dùng API này cho mục đó.
