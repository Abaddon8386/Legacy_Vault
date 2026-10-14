# Trustee — PS-19 (ST-04, LV-EXT-001, D-TRUSTEE-001)

Trạng thái: **contract đã chốt; PS-19 đã có triển khai Backend trong workspace**. Quyền: `VAULT_OWNER` + sở hữu Vault. URL theo D-TRUSTEE-001: **`/api/v1/trustees`**
(không có API Trusted Contact riêng; `vaultId` truyền trong body/query — D-API-18).

## Nguyên tắc nghiệp vụ

- Trustee là **tùy chọn**: Vault không có Trustee vẫn hợp lệ; không có API nào ép phải có.
- Trustee là người **bên ngoài**, **không cần tài khoản**: request/response không có `userId`.
- Chỉ định Trustee **không** tạo quyền mở khóa, giải mã, xem bí mật, nhận tài sản thay, và **không mặc nhiên là Beneficiary**.
  API không có cờ quyền nào dạng đó.
- Mỗi Vault tối đa một Trustee hiện hành. Thay thế/thu hồi **giữ lịch sử** (bản ghi cũ chuyển `REVOKED`, không xóa).
- Tiếp nhận/thay thế sau biến cố thuộc Staff (ngoài Sprint 1).

## Mô hình `TrusteeResponse`

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID | |
| `vaultId` | UUID | |
| `fullName` | string ≤ 150 | bắt buộc |
| `phone` | string | tùy chọn |
| `email` | string | tùy chọn |
| `relationship` | string ≤ 100 | tùy chọn (quan hệ với Owner) |
| `note` | string ≤ 500 | tùy chọn |
| `status` | enum `APPOINTED` \| `REVOKED` | lưu trực tiếp cùng giá trị trong DB; không ánh xạ sang `ACTIVE` |
| `appointedAt` | datetime UTC | bắt buộc; thời điểm bổ nhiệm, không đổi khi cập nhật thông tin |
| `revokedAt` | datetime UTC hoặc null | `null` khi `APPOINTED`; thời điểm thu hồi khi `REVOKED` |
| `updatedAt` | datetime UTC | thời điểm cập nhật gần nhất |

Ràng buộc: cần **ít nhất một** trong `phone`/`email` để Staff liên hệ được.

## Endpoint

| Method & path | Mô tả | Thành công | Lỗi |
|---|---|---|---|
| `POST /api/v1/trustees` | Chỉ định Trustee. Body: `vaultId`, `fullName`, `phone?`, `email?`, `relationship?`, `note?` | 201 `TrusteeResponse` | 400 · 401 · 403 · 404 (Vault) · 409 `TRUSTEE_ALREADY_EXISTS` · 409 `VAULT_NOT_EDITABLE` |
| `GET /api/v1/trustees?vaultId={id}` | Trustee hiện hành của Vault (`content` rỗng nếu chưa có) | 200 | 400 (thiếu `vaultId`) · 401 · 403 · 404 |
| `PUT /api/v1/trustees/{trusteeId}` | Cập nhật thông tin (không đổi `vaultId`) | 200 | 400 · 401 · 403 · 404 · 409 |
| `POST /api/v1/trustees/{trusteeId}/revoke` | Thu hồi chỉ định (còn quyền quản lý kho) | 200 `status: REVOKED` | 401 · 403 · 404 · 409 |

Ví dụ request: `{ "vaultId": "9c1f0b6e-…", "fullName": "Tran Thi B", "phone": "0900000001", "relationship": "Anh trai" }`

- **Audit:** `TRUSTEE_APPOINTED`, `TRUSTEE_UPDATED`, `TRUSTEE_REVOKED`.

## Test bám contract

Vault tồn tại không Trustee · thêm/cập nhật **không cần** `user_id` · không có endpoint/field cấp quyền mở khóa ·
Trustee không tự thành Beneficiary · không tạo tài khoản · ownership (Vault người khác → 404) · thu hồi giữ lịch sử.

## Staff contact history — PS-44 (ST-10, LV-EXT-001)

Staff ghi nhận từng lần liên hệ Trustee và trạng thái fallback tường minh qua
`POST /api/v1/staff/trustees/{trusteeId}/contact-outcomes`; xem lịch sử qua `GET` cùng path.
Các trường gồm kênh (`PHONE`, `EMAIL`, `IN_PERSON`, `OTHER`), kết quả (`CONTACTED`, `NO_RESPONSE`,
`INVALID_CONTACT`), trạng thái fallback (`NOT_REQUIRED`, `REQUIRED`, `IN_PROGRESS`, `COMPLETED`), ghi chú tùy chọn,
thời gian UTC và Staff actor trong dữ liệu/audit. Ghi chú không được đưa vào audit log.

Mỗi lần ghi là bản ghi lịch sử mới; không sửa/xóa lịch sử và không trao quyền truy cập Vault cho Trustee.
API không tự quyết định chuyển fallback. C3 trong `open-decisions.md` vẫn chưa chốt số lần liên hệ, kênh bắt buộc,
khoảng cách giữa các lần và thời hạn; Staff chọn trạng thái fallback theo hồ sơ thực tế.
