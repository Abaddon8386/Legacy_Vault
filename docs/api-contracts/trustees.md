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
| `status` | enum `APPOINTED` \| `REVOKED` | `APPOINTED` ánh xạ trạng thái `ACTIVE` ở DB (D-TRUSTEE-001) |
| `createdAt`, `updatedAt` | datetime | |

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
