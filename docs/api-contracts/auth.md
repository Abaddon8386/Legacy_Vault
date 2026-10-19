# Auth & RBAC — PS-9, PS-10, PS-11 (ST-01)

Trạng thái: **contract đã chốt**, chưa triển khai (khung bảo mật & lỗi chung đã có từ PS-74).

## POST /api/v1/auth/register — PS-9

- **Quyền:** công khai. Vai trò gán cho tài khoản mới do **server** quyết định (`VAULT_OWNER`); client **không** gửi role.
- **Request:**

  | Trường | Kiểu | Bắt buộc | Validation |
  |---|---|---|---|
  | `fullName` | string | ✔ | không rỗng, ≤ 150 |
  | `email` | string | ✔ | định dạng email, ≤ 254; chuẩn hóa chữ thường; duy nhất không phân biệt hoa/thường |
  | `password` | string | ✔ | 8–72 ký tự **[D-API-17]** |
  | `phone` | string | – | chữ số, có thể bắt đầu bằng `+`, 8–15 ký tự |

  ```json
  { "fullName": "Nguyen Van A", "email": "user@example.com", "password": "ExamplePass123", "phone": "0900000000" }
  ```
- **Response 201** (+ `Location`): *không chứa mật khẩu hay token.*
  ```json
  { "id": "3f2b8c1e-0a4d-4c8e-9b1a-6a1d2f3e4b5c", "fullName": "Nguyen Van A", "email": "user@example.com",
    "roles": ["VAULT_OWNER"], "status": "ACTIVE", "createdAt": "2026-10-08T10:00:00Z" }
  ```
- **Lỗi:** `400 VALIDATION_FAILED` · `409 EMAIL_ALREADY_EXISTS`.
- **Nghiệp vụ:** mật khẩu băm **BCrypt**; không log mật khẩu/token. Tài khoản `ACTIVE` ngay (D-API-16). 409 cho phép dò email
  đã đăng ký — rủi ro được chấp nhận ở bước đăng ký (ghi nhận).
- **Audit:** `AUTH_REGISTERED` (không ghi mật khẩu).

## POST /api/v1/auth/login — PS-10

- **Quyền:** công khai.
- **Request:** `{ "email": "user@example.com", "password": "ExamplePass123" }` (`email` hợp lệ, `password` không rỗng).
- **Response 200:**
  ```json
  { "accessToken": "<jwt>", "tokenType": "Bearer", "expiresInSeconds": 3600,
    "user": { "id": "3f2b8c1e-…", "fullName": "Nguyen Van A", "email": "user@example.com", "roles": ["VAULT_OWNER"] } }
  ```
  (`expiresInSeconds` lấy từ cấu hình — mặc định 3600, D-API-21. Không có `refreshToken` ở Sprint 1 — D-API-05.)
- **Lỗi:** `400 VALIDATION_FAILED` · `401 INVALID_CREDENTIALS` — **cùng một mã** cho: sai mật khẩu, email không tồn tại,
  tài khoản đã xóa (`deleted_at != null`). Không lộ lỗi nội bộ.
- **Nghiệp vụ:** chỉ user active được xác thực; `deleted_at != null` bị từ chối.
- **Audit:** `AUTH_LOGIN_SUCCEEDED` / `AUTH_LOGIN_FAILED` (ghi email đã che hoặc userId nếu có; không ghi mật khẩu).

## GET /api/v1/auth/me — **[D-API-23]**

- **Quyền:** đã đăng nhập. **Response 200:** như `user` ở trên. **Lỗi:** `401 UNAUTHENTICATED`.
- Để FE khởi tạo trạng thái đăng nhập mà không giải mã JWT phía client.
- D-API-04 cập nhật 2026-10-19: FE khôi phục phiên từ `sessionStorage` của tab sau reload và xác minh qua endpoint này trước khi hiển thị trang bảo vệ. Không gia hạn token; lỗi mạng cho phép thử lại, 401 xóa phiên. API request/response không đổi.

## Bảo mật & RBAC — PS-11

- Backend là security boundary; dùng `SecurityFilterChain` + `Authentication` principal/authorities; **không giải mã JWT thủ công** trong controller.
- Authority: `ROLE_VAULT_OWNER`, `ROLE_STAFF_EXECUTOR`, `ROLE_LEGAL_VERIFIER`, `ROLE_ADMIN`, `ROLE_BENEFICIARY`
  (mã `ROLE_BENEFICIARY` do nhóm chốt 2026-10-11; Main Flow §1 không ghi mã này). Sprint 1 chỉ cần `VAULT_OWNER`
  (Beneficiary/Staff/Legal chưa có API trong PS-9..23). Giá trị trong bảng `roles` phải khớp đúng các mã này.
- Bảng truy cập Sprint 1:

  | Đường dẫn | Truy cập |
  |---|---|
  | `POST /auth/register`, `POST /auth/login`, `GET /system/ping`, `GET /system/db-check` (dev) | Công khai |
  | `GET /auth/me` | Đã đăng nhập |
  | `/vaults/**`, `/trustees/**` | `VAULT_OWNER` + ownership |
  | `/dms/**` | `VAULT_OWNER` (DMS của chính người đăng nhập) |
  | Còn lại | Đã đăng nhập (mặc định từ chối) |

- Chưa đăng nhập → `401 UNAUTHENTICATED`; sai role → `403 ACCESS_DENIED` (cùng `ApiError`).
- Không dùng `SCOPE_RETRIEVAL`, claim link, OTP email.

## Test bám contract

Success/validation/401/403: `ErrorContractTest` (khung). PS-9/10/11 bổ sung: đăng ký thành công, trùng email 409, mật khẩu
được băm (không bằng plaintext), đăng nhập đúng/sai/đã xóa, token hợp lệ vs thiếu token vs sai role.
