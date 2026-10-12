# Beneficiary — PS-20, PS-21 (ST-05)

Trạng thái: **contract đã chốt**. Quyền: `VAULT_OWNER` + sở hữu Vault.

## Nguyên tắc nghiệp vụ

- Beneficiary **độc lập với tài khoản `User`**: không cần tài khoản khi khai báo; request/response không có `userId`.
- **Không tự tạo tài khoản.** Tài khoản được tạo/liên kết sau, tại quầy, do Staff hướng dẫn (ST-24) — ngoài Sprint 1.
- **Không** có Claim Link, OTP email, Guest Portal.
- Nếu gửi `identityNumber`, Backend mã hóa AES-GCM trước khi lưu. Cấu hình khóa base64 qua biến môi trường `BENEFICIARY_ENCRYPTION_KEY`; không ghi giá trị khóa vào repo/log.
- Bảng `asset_allocations` trong DB là **kế hoạch phân bổ chờ Legal duyệt** (LV-BASIS-001), không phải quyết định của Owner; Sprint 1 không có API cho bảng này.
- Danh sách này chỉ **chỉ định ai là người thụ hưởng**. Owner **không** quyết định phần chia: phần chia do văn bản căn cứ được
  Legal duyệt (LV-BASIS-001), nên không có trường tỷ lệ/phần chia.
- Trustee không thay thế Beneficiary: Vault chỉ có Trustee mà không có Beneficiary vẫn **chưa đủ điều kiện** cấu hình.

## Mô hình `BeneficiaryResponse`

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | UUID | |
| `vaultId` | UUID | |
| `fullName` | string ≤ 150 | bắt buộc |
| `relationship` | string ≤ 100 | tùy chọn |
| `dateOfBirth` | date `YYYY-MM-DD` | tùy chọn, không ở tương lai |
| `phone`, `email` | string | tùy chọn |
| `hasIdentityNumber` | boolean | cho biết đã có số định danh; số gốc là **write-only** (`identityNumber`) và **không bao giờ** trả ra (D-API-26) |
| `hasAccount` | boolean | chỉ đọc; luôn `false` ở Sprint 1 |
| `status` | enum `DESIGNATED` | |
| `createdAt`, `updatedAt` | datetime | |

## Endpoint — PS-20

| Method & path | Mô tả | Thành công | Lỗi |
|---|---|---|---|
| `POST /api/v1/vaults/{vaultId}/beneficiaries` | Thêm Beneficiary | 201 | 400 · 401 · 403 · 404 · 409 `VAULT_NOT_EDITABLE` |
| `GET /api/v1/vaults/{vaultId}/beneficiaries` | Liệt kê (envelope phân trang) | 200 | 401 · 403 · 404 |
| `PUT /api/v1/vaults/{vaultId}/beneficiaries/{beneficiaryId}` | Cập nhật thông tin | 200 | 400 · 401 · 403 · 404 · 409 |

Ví dụ request:
```json
{ "fullName": "Nguyen Van C", "relationship": "Con trai", "dateOfBirth": "1995-05-20",
  "phone": "0900000002", "email": "child@example.com" }
```
- **Audit:** `BENEFICIARY_ADDED`, `BENEFICIARY_UPDATED` (không ghi số định danh đầy đủ).
- Xóa Beneficiary: **chưa có** trong ticket → không định nghĩa (câu hỏi cho nhóm).

## Kiểm tra điều kiện Beneficiary — PS-21 (D-API-25)

Cần **≥ 1 Beneficiary** để hoàn tất cấu hình.

### GET /api/v1/vaults/{vaultId}/configuration-check

- **Response 200:**
  ```json
  { "vaultId": "9c1f0b6e-…", "ready": false, "beneficiaryCount": 0,
    "issues": [ { "code": "BENEFICIARY_REQUIRED", "messageKey": "config.beneficiaryRequired",
                  "message": "Cần ít nhất một người thụ hưởng." } ] }
  ```
  `ready = true` khi `beneficiaryCount ≥ 1` (và `issues` rỗng). Trustee **không** được tính vào điều kiện này.

### Chặn ở thao tác hoàn tất cấu hình

Thao tác bật DMS (`PUT /vaults/{id}/dms`, PS-22) khi `beneficiaryCount = 0` → **`422 BENEFICIARY_REQUIRED`**
(business exception, vi/en). Với ≥ 1 Beneficiary hợp lệ thì qua.

## Test bám contract

Thêm/cập nhật/liệt kê không cần `user_id` · không tạo `User` · ownership (Vault người khác → 404) · 0 Beneficiary bị chặn
(422 + thông điệp vi/en) · ≥ 1 hợp lệ qua · chỉ có Trustee vẫn bị chặn · không có trường phần chia.
