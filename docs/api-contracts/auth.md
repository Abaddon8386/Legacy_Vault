# Auth & RBAC — PS-9, PS-10, PS-11 (ST-01)

**PS-86, policy 20/10/2026:** xem [beneficiary-invitations.md](beneficiary-invitations.md).
Owner có API quản lý mã; service nội bộ `linkAccount(code, accountId)` chỉ chạy trong
outer transaction PS-87. PS-87 hiện có `POST /api/v1/auth/invitations/redeem` sau đăng nhập;
account lấy từ principal và bị kiểm tra ACTIVE. Chỉ invitation generation được Staff PS-106
gắn với email đã xác nhận tại quầy mới được redeem khi normalized email tài khoản khớp chính xác;
`email_verified_at` có thể NULL riêng cho flow này. Đây không phải xác minh mailbox và không
ghi cột đó. Invitation legacy/Owner không binding vẫn fail closed. Mã chỉ liên kết Beneficiary,
không cấp quyền đọc tài sản; PS-104 exact-recipient item `DELIVERED` vẫn là gate duy nhất.
Không có signup+redeem công khai, không nhận role/account ID từ client, không đổi Google login.

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

## POST /api/v1/auth/google — PS-85

- **Quyền:** công khai; nhận Google Identity Services (GIS) ID credential từ callback PS-83.
- **Request:** `{ "credential": "<Google ID token>" }`. Backend xác minh chữ ký RS256 qua JWKS chính thức Google,
  issuer (`accounts.google.com` hoặc `https://accounts.google.com`), audience bằng `GOOGLE_CLIENT_ID`, thời hạn,
  `iat` và `sub`. Client không gửi profile/email/role để định danh tài khoản.
- **Response 200:** cùng `LoginResponse` với đăng nhập mật khẩu; JWT, thời hạn và role đều lấy từ LegacyVault.
- **Lỗi:** `400 VALIDATION_FAILED`; `401 INVALID_GOOGLE_CREDENTIAL` cho token không hợp lệ/hết hạn/dùng lại;
  `401 INVALID_CREDENTIALS` cho subject chưa liên kết hoặc tài khoản không `ACTIVE`/đã xóa;
  `503 GOOGLE_SIGNIN_UNAVAILABLE` khi thiếu cấu hình client ID hoặc không truy cập được Google JWKS.
- Credential hợp lệ chỉ được đổi lấy phiên thành công một lần. Database lưu fingerprint SHA-256 (không lưu credential);
  các fingerprint hết hạn được dọn ở lần đăng nhập Google tiếp theo. Endpoint stateless, nhận JSON và không dùng cookie;
  CORS vẫn giới hạn browser origin theo cấu hình.
- Bảng `dbo.external_auth_identities` ánh xạ chính xác `provider_code=GOOGLE` + Google `sub` sang tài khoản. PS-85
  không đăng ký Google, không liên kết theo email, không tự tạo tài khoản và không cấp role. Subject chưa có mapping bị
  từ chối bằng lỗi chung `INVALID_CREDENTIALS`.
- **Audit:** dùng `AUTH_LOGIN_SUCCEEDED`/`AUTH_LOGIN_FAILED` hiện có, không ghi credential, token, subject hoặc profile.

## POST /api/v1/auth/google/link — PS-85

- **Quyền:** JWT LegacyVault hợp lệ của tài khoản đang đăng nhập. Tài khoản được tải lại từ database và phải `ACTIVE`,
  chưa bị xóa. Không nhận user ID, role hoặc Google `sub` từ request.
- **Request:** `{ "credential": "<Google ID token>" }`; backend xác minh token như endpoint đăng nhập Google và chỉ dùng
  `sub` từ kết quả xác minh. Không dùng email để tìm/liên kết tài khoản.
- **Response 200:** `{ "linked": true }`. Sau đó cùng Google ID token mới (mỗi credential chỉ dùng một lần) có thể đăng nhập
  qua mapping `GOOGLE + sub` vừa tạo.
- **Lỗi:** `400 VALIDATION_FAILED`; `401 UNAUTHENTICATED` khi không có principal hợp lệ hoặc tài khoản hiện tại không còn
  đủ điều kiện; `401 INVALID_GOOGLE_CREDENTIAL` cho credential sai/hết hạn/đã dùng; `409 GOOGLE_IDENTITY_ALREADY_LINKED`
  nếu subject đã có mapping. Cạnh tranh tạo mapping được bảo vệ thêm bằng unique constraint `(provider_code, subject)`;
  toàn bộ thao tác mapping, đánh dấu credential đã dùng và audit nằm trong một transaction.
- Chỉ liên kết vào chính tài khoản của JWT hiện tại; không hỗ trợ link tài khoản khác, email matching, Google signup,
  role assignment hay tự động khôi phục tài khoản. Audit chỉ ghi actor/action/provider, không ghi `sub`, credential hoặc email.

## GET /api/v1/auth/me — **[D-API-23]**

- **Quyền:** đã đăng nhập. **Response 200:** `{ "id", "fullName", "email", "phoneNumber", "roles" }`; roles đọc từ DB. Không trả trạng thái nội bộ, mật khẩu/hash hay token.
- Danh tính chỉ lấy từ principal đã xác thực.
- Để FE khởi tạo trạng thái đăng nhập mà không giải mã JWT phía client.
- D-API-04 cập nhật 2026-10-19: FE khôi phục phiên từ `sessionStorage` của tab sau reload và xác minh qua endpoint này trước khi hiển thị trang bảo vệ. Không gia hạn token; lỗi mạng cho phép thử lại, 401 xóa phiên.

## PATCH /api/v1/auth/me — PS-79

- **Quyền:** đã đăng nhập; chỉ cập nhật tài khoản trong principal hiện hành. Không nhận ID, role hay trạng thái từ request.
- **Trường cập nhật:** partial JSON nhận `fullName`, `email`, `phoneNumber`, `password`. Field khác (kể cả `id`, `roles`, `authVersion`, `password_login_enabled`, `status`) bị từ chối với `400 MALFORMED_REQUEST`. Trường bỏ qua/null không đổi; object không có thay đổi là no-op. `phoneNumber: ""` xóa số điện thoại.
- **Validation:** tên 1–150 ký tự; phone 8–15 chữ số, `+` tùy chọn; email hợp lệ tối đa 254 ký tự và chuẩn hóa lowercase; password theo `PasswordPolicy` (8–72 ký tự/byte UTF-8, không NUL, Unicode hợp lệ).
- **Reauthentication:** khi email thực sự đổi hoặc có password mới, request phải kèm `currentPassword`. Nếu không đổi email/password thì không gửi field này. Server dùng `PasswordReauthService`; sai mật khẩu ghi `REAUTH_FAILED` và áp dụng giới hạn hiện hành (mặc định 5 lần/15 phút, 429 `TOO_MANY_ATTEMPTS`). Thiếu bằng chứng trả `400 MALFORMED_REQUEST`; sai trả `403 REAUTH_FAILED`. Không cần reauth cho tên/số điện thoại. `currentPassword` chỉ được dùng xác minh, không lưu hoặc trả về.
- **Email:** kiểm tra trùng trước cập nhật và unique constraint `UQ_users_email` là chốt cuối khi có request đồng thời; trùng trả `409 EMAIL_ALREADY_EXISTS`. Xác minh email (PS-116, chờ quyết định policy) xem [email-verification.md](email-verification.md); khi đổi địa chỉ, `email_verified_at` được xóa để không mang bằng chứng cũ sang địa chỉ mới.
- **Password:** mã hóa bằng encoder hiện hành. Tài khoản `password_login_enabled=0` không vượt qua reauthentication bằng password và không bị bật password login. Đổi password tăng `authVersion` trong cùng transaction với cập nhật password/audit; JWT cũ bị từ chối tại request kế tiếp theo `JwtAuthenticationFilter`. Không thay đổi recovery flow PS-112.
- **Response 200:** `{ "id", "fullName", "email", "phoneNumber", "roles" }`; không chứa password, hash, currentPassword hay token.
- **Lỗi:** `400 VALIDATION_FAILED` hoặc `MALFORMED_REQUEST`, `401 UNAUTHENTICATED`, `403 REAUTH_FAILED`, `409 EMAIL_ALREADY_EXISTS`, `429 TOO_MANY_ATTEMPTS`.
- Cập nhật ghi `AUTH_PROFILE_UPDATED` với kết quả và tên trường thay đổi, không ghi giá trị. Actor lấy từ principal. Audit và thay đổi profile cùng transaction theo `LV-AUD-001`; lỗi audit làm rollback cập nhật.

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

## PS-112

Recovery contract and session-version deployment/rollback policy: [password-recovery.md](password-recovery.md). Password login and password reauth reject explicitly password-disabled accounts; unclassified legacy accounts keep existing login but cannot recover. Legacy JWTs without authVersion must sign in again. New JWT claims are checked against the DB on every protected request.
