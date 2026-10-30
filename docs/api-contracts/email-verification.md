# Email verification — PS-116 (Backend)

Trạng thái: **đã triển khai theo các quyết định chính thức ngày 30/10/2026** (bên dưới). Chưa kiểm chứng gửi email thật
tới nhà cung cấp (cần `RESEND_API_KEY`, người gửi, allowlist người nhận và domain thật).
Phạm vi: chứng minh quyền sở hữu email của tài khoản đăng ký bằng email/password. Không thuộc phạm vi:
Staff counter verification (PS-106/PS-88), invitation (PS-86), recovery (PS-112), Google login (PS-85),
OTP cho Beneficiary, Guest Portal/Claim Link, quy trình bàn giao di sản. Điều kiện redeem PS-87 (chốt 21/10/2026) không đổi.

## Quyết định chính thức (30/10/2026)
| # | Nội dung | Triển khai |
|---|---|---|
| 1 | Phương thức: **link**, token sau `#` (fragment) như recovery; FE lấy token từ fragment rồi gửi cho BE | `EmailVerificationConfiguration.link()` = `<verify-url>#token=<credential>` |
| 2 | TTL **24 giờ** (1440 phút) | `ttl-minutes` mặc định 1440 |
| 3 | Gửi: tối đa **3/15 phút** và **5/24 giờ** mỗi tài khoản. Xác nhận: tối đa **5/15 phút/IP**, dùng limiter dùng chung | `send-limits=1/60,3/900,5/86400`, `confirm-limit=5/900` qua `RecoveryRateLimiter` (bảng `password_recovery_limits`, khóa HMAC) |
| 4 | Gửi lại **thu hồi** credential cũ; cooldown **60 giây** | Cửa sổ `1/60` là cooldown; `prepare` thu hồi mọi credential còn hiệu lực rồi tăng `generation` |
| 5 | Redirect: chỉ `https://<domain-thật>/verify-email` và `http://localhost:5173/verify-email` | `verify-url` được kiểm tra khi khởi động; URL do server dựng từ cấu hình, FE không truyền gì |
| 6 | LOCKED/DELETED: từ chối | cả request và confirm |
| 7 | Tài khoản chỉ Google (không có password login): từ chối, không thay PS-85 | `409 EMAIL_VERIFICATION_NOT_APPLICABLE` |
| 8 | Đổi email: **không** tự gửi mail mới; thu hồi credential cũ; `email_verified_at` về NULL | `AuthService.updateCurrentUser` gọi `revokeForEmailChange` trong cùng transaction |
| 9 | Confirm **không** cần đăng nhập | công khai; vẫn kiểm tra token, tài khoản, email, purpose, generation, trạng thái |
| 10 | Không chặn thêm thao tác nào khi chưa xác minh | không có; cần chặn thì tạo ticket riêng |
| 11 | Dùng lại Resend/email service hiện có; giữ path `/api/v1/auth/email-verification/...` | `ResendEmailVerificationMailTransport` gọi `ResendRecoveryMailTransport.sendMessage` |

Quy tắc bảo mật cố định:
- Token 256-bit ngẫu nhiên (`SecureRandom`), chỉ lưu SHA-256 có tiền tố `EMAIL_VERIFICATION:`; không trả qua API, không log.
- Credential gắn với đúng tài khoản, **email hiện tại** (`email_fingerprint`), `purpose` và `generation`; chỉ generation mới nhất được consume.
- Consume credential và ghi `email_verified_at` atomic trong một transaction; hai request đồng thời chỉ một thắng; không replay.
- Client không gửi `email_verified_at`, `verified`, `userId` hay email tùy ý. Không backfill, không tự xác minh Google, không mở khóa, không cấp role, không liên kết beneficiary.
- Credential recovery/invitation không dùng được ở đây và ngược lại.

## Endpoint

| Method | Path | Auth | Mục đích |
|---|---|---|---|
| GET | `/api/v1/auth/email-verification` | JWT | Đọc trạng thái của chính mình |
| POST | `/api/v1/auth/email-verification/requests` | JWT | Yêu cầu gửi / gửi lại (cùng một thao tác) |
| POST | `/api/v1/auth/email-verification/confirm` | công khai | Xác nhận bằng credential một lần |

### GET status → 200
```json
{ "verified": false, "verifiedAt": null, "requestAvailable": true,
  "lastRequestState": "QUEUED", "lastRequestedAt": "2026-10-30T03:00:00" }
```
`lastRequestState`: `QUEUED` (đã xếp hàng, **chưa gửi**) · `PROVIDER_ACCEPTED` (nhà cung cấp đã nhận, không phải bằng chứng vào inbox) · `FAILED` · `SKIPPED` (job quá hạn, đổi email, tài khoản không còn đủ điều kiện) · `null` (chưa từng yêu cầu).
`requestAvailable=false` khi đã xác minh, tài khoản không có password login, hoặc gửi mail chưa được bật.

### POST requests
Body tùy chọn `{ "locale": "vi" | "en" }`. Không nhận email hay ID.
- `202 { "status": "QUEUED" }` — chỉ nghĩa là đã xếp hàng. Credential **không bao giờ** nằm trong response.
- `409 EMAIL_ALREADY_VERIFIED` · `409 EMAIL_VERIFICATION_NOT_APPLICABLE`
- `429 RATE_LIMITED` (cooldown 60 giây, 3/15 phút, 5/24 giờ) · `503 EMAIL_VERIFICATION_UNAVAILABLE` (gửi mail chưa bật hoặc hạ tầng lỗi) · `401`

### POST confirm
Body `{ "credential": "<43 ký tự base64url>" }` → `204`. Mọi lý do thất bại (không tồn tại, hết hạn, đã dùng, bị thu hồi, không phải generation mới nhất, sai email, tài khoản LOCKED/DELETED/không có password login) trả cùng `400 EMAIL_VERIFICATION_INVALID`. `429 RATE_LIMITED` khi một IP vượt 5 lượt/15 phút.

## Dữ liệu
Migration `V56__email_verification.sql`: `email_verification_credentials` (hash, `generation`, `email_fingerprint`, `expires_at`, `consumed_at`, `revoked_at`) và `email_verification_jobs` (QUEUED/CLAIMED/PREPARED/ACCEPTED/FAILED/SKIPPED). Credential chỉ được sinh khi worker `prepare` một job; giá trị thô chỉ tồn tại trong bộ nhớ từ `prepare` đến transport.

## Cấu hình
| Biến môi trường | Ý nghĩa |
|---|---|
| `EMAIL_VERIFICATION_ENABLED` (mặc định `false`) | Bật worker gửi và cho phép `requests`. Tắt → `requests` trả 503 (không xếp hàng job không ai gửi) |
| `EMAIL_VERIFICATION_URL` | Bắt buộc khi bật; chỉ `https://<host>/verify-email` hoặc `http://localhost:5173/verify-email` |
| `RESEND_API_KEY`, `RECOVERY_EMAIL_FROM`, `RECOVERY_RECIPIENT_ALLOWLIST` | **Dùng chung** với recovery. Allowlist người nhận vẫn áp dụng: chỉ địa chỉ trong danh sách mới nhận được mail |

TTL, `send-limits`, `confirm-limit` có mặc định theo quyết định ở trên và có thể ghi đè bằng
`legacyvault.auth.email-verification.*`. Giá trị sai định dạng hoặc cửa sổ > 24 giờ làm ứng dụng không khởi động
(limiter chỉ giữ sự kiện 1 ngày). `confirm` luôn hoạt động với credential đã phát hành.

## Fixture cho FE
[fixtures/email-verification.json](fixtures/email-verification.json)

## Lưu ý vận hành / điểm lệch cần biết
- **Giới hạn xác nhận đếm mọi lượt gọi**, không chỉ lượt sai: limiter dùng chung ghi nhận mỗi lần gọi (giống `reset-ip` của recovery). Một lượt thành công cũng tính vào hạn mức 5/15 phút của IP đó — nghiêm hơn quyết định một chút. Đếm riêng lượt sai cần thêm phương thức vào `RecoveryRateLimiter`.
- IP lấy từ `request.getRemoteAddr()` (như recovery). Sau reverse proxy, mọi người cùng chia một IP nếu proxy không được cấu hình forwarded headers.
- `Retry-After` của `429` hiện cố định 900 giây (handler chung), kể cả khi chỉ vướng cooldown 60 giây.
- Allowlist người nhận của recovery áp dụng cho cả xác minh email; cần mở rộng/bỏ nó theo quyết định riêng trước khi gửi cho người dùng thật.
- Cần domain thật cho `EMAIL_VERIFICATION_URL` (câu 5) và FE trang `/verify-email` đọc `#token=` rồi gọi `confirm`.
