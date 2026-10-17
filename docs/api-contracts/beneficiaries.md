# Beneficiary — PS-20, PS-21 (ST-05)

Trạng thái PS-20/21: **contract đã chốt**. Quyền: `VAULT_OWNER` + sở hữu Vault.

## Xác minh danh tính trực tiếp — PS-45 (ST-14, LV-ID-001)

Luồng Staff nhận `beneficiaryId` từ danh sách trong Vault đang mở vẫn chờ xác định API nguồn cho
`vaultId` và danh sách Beneficiary. FE không dùng ô nhập UUID thủ công làm luồng chính.

POST và GET đều kiểm tra `verification_cases`: ca phải `OPEN`, thuộc đúng Vault của Beneficiary,
và được giao cho Staff đang đăng nhập. Không có đối tượng/ca, ca chưa nhận, đã hủy, khác Staff
hoặc khác Vault đều trả `404 RESOURCE_NOT_FOUND`, kể cả lịch sử rỗng. Chưa đăng nhập: 401;
sai role: 403. Không suy diễn quyền từ `vaults.status` hoặc DMS.
Ghi khóa Vault rồi VerificationCase trong cùng transaction với lịch sử, trạng thái và audit;
lỗi audit rollback tất cả. Beneficiary được refresh sau khi lấy khóa để tránh trạng thái cũ khi chờ.
Ca OPEN không chứng minh hồ sơ pháp lý đủ điều kiện cho PS-46–48.

`MATCH` được lưu nguyên trong lịch sử và đặt trạng thái hiện tại thành `VERIFIED_AT_COUNTER`.
Quyết định xác nhận ngày 2026-10-17: `NOT_MATCH` đặt trạng thái hiện tại về `NOT_VERIFIED`,
kể cả từ `VERIFIED_AT_COUNTER`. Kết quả lịch sử vẫn là `NOT_MATCH`; mỗi lần xác minh thêm bản ghi mới,
không ghi đè lịch sử cũ. Cả MATCH và NOT_MATCH trả 201 khi hợp lệ. Khi có nhiều lần ghi đồng thời,
khóa tuần tự hóa xử lý; trạng thái hiện tại khớp với kết quả được xử lý cuối cùng.
Migration V7/V8 vẫn xung đột, chờ nhóm cấp số; không dùng V12/V13 của PS-77 hay số dành cho PS-41–43.
Staff queue/detail hiện trả Vault/Owner IDs, không trả beneficiaryId; cần API discovery theo ca được giao.
Không dùng endpoint Owner hoặc ô nhập UUID thay cho dependency này.

Staff Executor đối chiếu bản cứng CCCD/passport với khuôn mặt trực tiếp qua
`POST /api/v1/staff/beneficiaries/{beneficiaryId}/identity-verifications`. Kết quả `MATCH` hoặc `NOT_MATCH`,
loại giấy tờ, cơ quan cấp (nếu có), hậu tố đúng bốn ký tự chữ/số nếu được gửi và thời điểm UTC được lưu
trong lịch sử append-only. Actor được ghi trong record và audit log;
audit chỉ chứa result, documentType, stepId, ruleId, không chứa cơ quan cấp, hậu tố hoặc giấy tờ.
Response của POST và GET lịch sử trả `verifiedBy: { id, fullName }` cùng `verifiedAt` UTC để FE hiển thị
người kiểm tra và thời gian theo PS-27. `id` là public UUID của tài khoản Staff; `fullName` là tên hiện tại
của tài khoản, không phải bản chụp tên tại thời điểm xác minh.

Không tải ảnh/scan, không lưu số định danh đầy đủ, và không gọi VNeID, camera hay eKYC. `GET` cùng path trả lịch sử
xác minh mới nhất trước. Cả hai endpoint chỉ dành cho `ROLE_STAFF_EXECUTOR`.

## Nguyên tắc nghiệp vụ

- Beneficiary **độc lập với tài khoản `User`**: không cần tài khoản khi khai báo; request/response không có `userId`.
- **Không tự tạo tài khoản.** Tài khoản được tạo/liên kết sau, tại quầy, do Staff hướng dẫn (ST-24) — ngoài Sprint 1.
- **Không** có Claim Link, OTP email, Guest Portal.
- Nếu gửi `identityNumber`, Backend mã hóa AES-256-GCM bằng khóa chung `LEGACYVAULT_ENCRYPTION_KEY` (base64, 32 byte). Cột mã hóa lưu cả IV và `LEGACYVAULT_ENCRYPTION_KEY_VERSION`; không ghi khóa hoặc số định danh vào repo/log.
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
| `createdAt`, `updatedAt` | datetime | cột `created_at`, `updated_at` (`updated_at` thêm bởi migration V4 — D-API-31) |

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

Thao tác bật DMS (`PUT /api/v1/dms`, PS-22) khi `beneficiaryCount = 0` → **`422 BENEFICIARY_REQUIRED`**
(business exception, vi/en). Với ≥ 1 Beneficiary hợp lệ thì qua.

## Test bám contract

Thêm/cập nhật/liệt kê không cần `user_id` · không tạo `User` · ownership (Vault người khác → 404) · 0 Beneficiary bị chặn
(422 + thông điệp vi/en) · ≥ 1 hợp lệ qua · chỉ có Trustee vẫn bị chặn · không có trường phần chia.
