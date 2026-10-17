# Hợp đồng lỗi chung

Triển khai: `backend/src/main/java/com/legacyvault/common/error/` (`ErrorCode`, `ApiError`, `BusinessException`,
`GlobalExceptionHandler`) và `common/security/` (`ApiAuthenticationEntryPoint`, `ApiAccessDeniedHandler`).
Mọi phản hồi lỗi — kể cả **401/403 do Spring Security** — dùng **cùng một hình dạng**.

## 1. Hình dạng

```json
{
  "timestamp": "2026-10-08T10:00:00Z",
  "status": 409,
  "code": "EMAIL_ALREADY_EXISTS",
  "messageKey": "error.auth.emailExists",
  "message": "Email này đã được đăng ký.",
  "path": "/api/v1/auth/register",
  "traceId": "7f3c1e2a-5b4d-4c1e-9a77-0d9f2b1c3a10",
  "errors": []
}
```

| Trường | Ý nghĩa |
|---|---|
| `timestamp` | Thời điểm lỗi, ISO-8601 UTC |
| `status` | Mã HTTP (trùng status của response) |
| `code` | **Mã ổn định** để FE phân loại. Không đổi theo ngôn ngữ |
| `messageKey` | Khóa thông điệp i18n (FE có thể tự dịch nếu muốn) |
| `message` | Thông điệp đã dịch theo `Accept-Language`, **chỉ để hiển thị** |
| `path` | Đường dẫn request |
| `traceId` | Mã truy vết; cũng có ở header `X-Trace-Id` và trong log server |
| `errors` | Chỉ có phần tử với `VALIDATION_FAILED`: `{ field, code, messageKey, message }` |

Lỗi validation:

```json
{
  "status": 400, "code": "VALIDATION_FAILED", "messageKey": "error.validation.failed",
  "message": "Dữ liệu không hợp lệ.", "path": "/api/v1/auth/register", "traceId": "…",
  "errors": [
    { "field": "email",    "code": "EMAIL",     "messageKey": "validation.Email",    "message": "Email không đúng định dạng." },
    { "field": "password", "code": "SIZE",      "messageKey": "validation.Size",     "message": "Độ dài không hợp lệ." }
  ]
}
```

## 2. Bảng mã lỗi hiện có (đã cài trong `ErrorCode`)

| `code` | HTTP | Khi nào |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Dữ liệu đầu vào sai quy tắc validation |
| `MALFORMED_REQUEST` | 400 | JSON hỏng, thiếu tham số bắt buộc, sai kiểu tham số |
| `UNAUTHENTICATED` | 401 | Chưa đăng nhập, token thiếu/sai/hết hạn |
| `INVALID_CREDENTIALS` | 401 | Sai email/mật khẩu, hoặc tài khoản đã xóa (`deleted_at != null`) — **không phân biệt** |
| `ACCESS_DENIED` | 403 | Đã đăng nhập nhưng thiếu role |
| `REAUTH_FAILED` | 403 | Nhập sai mật khẩu xác nhận khi xem nội dung bảo mật (D-API-32). Không dùng 401 để FE không coi là hết phiên |
| `RESOURCE_NOT_FOUND` | 404 | Không có tài nguyên, **hoặc** không thuộc quyền người gọi (D-API-07) |
| `METHOD_NOT_ALLOWED` | 405 | Sai phương thức HTTP |
| `EMAIL_ALREADY_EXISTS` | 409 | Đăng ký trùng email |
| `TRUSTEE_ALREADY_EXISTS` | 409 | Vault đã có Trustee hiện hành |
| `VAULT_NOT_EDITABLE` | 409 | Vault hiện không cho phép Owner chỉnh sửa |
| `DMS_NOT_MONITORING` | 409 | Check-in hoặc cấu hình khi DMS không ở `MONITORING` |
| `VERIFICATION_CASE_NOT_OPEN` | 409 | Ghi nhận chứng từ trên ca xác minh đã hủy/đóng (PS-38, PS-39) |
| `LEGAL_VERIFICATION_INVALID_STATE` | 409 | Legal quyết định khi ca không còn `OPEN` hoặc Vault không ở `AWAITING_VERIFICATION` (PS-36) |
| `LEGAL_VERIFICATION_ALREADY_DECIDED` | 409 | Giấy tờ khai tử đã có quyết định thẩm định (PS-36) |
| `WILL_NOT_VERIFIED` | 409 | Phân loại căn cứ khi chưa có kết quả đối chiếu di chúc khớp (PS-41) |
| `BASIS_DOSSIER_ALREADY_EXISTS` | 409 | Ca đã có hồ sơ căn cứ (PS-41) |
| `BASIS_DOSSIER_INVALID_STATE` | 409 | Ca, Vault hoặc hồ sơ căn cứ không ở trạng thái cho phép thao tác (PS-41, PS-42, PS-43) |
| `BASIS_VERSION_STALE` | 409 | Phiên bản được chuyển không phải phiên bản mới nhất của hồ sơ (PS-42) |
| `BENEFICIARY_REQUIRED` | 422 | Bật DMS khi Vault chưa có Beneficiary |
| `PAYLOAD_TOO_LARGE` | 413 | File/body vượt giới hạn |
| `TOO_MANY_ATTEMPTS` | 429 | Nhập sai mật khẩu xác nhận quá số lần cho phép trong cửa sổ thời gian (D-API-32) |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Định dạng nội dung/file không hỗ trợ |
| `INTERNAL_ERROR` | 500 | Mọi lỗi không lường trước. Luôn trả thông điệp chung |

## 3. Mã lỗi nghiệp vụ theo ticket

| `code` | HTTP | Ticket | Khi nào |
|---|---|---|---|
| `VAULT_ALREADY_EXISTS` | 409 | PS-12 | Owner đã có Vault (DB giới hạn mỗi Owner một Vault) |
| `BENEFICIARY_REQUIRED` | 422 | PS-21 | Hoàn tất cấu hình/bật DMS khi Vault chưa có Beneficiary nào |
| `TRUSTEE_ALREADY_EXISTS` | 409 | PS-19 | Vault đã có Trustee hiện hành khi tạo thêm |
| `VAULT_NOT_EDITABLE` | 409 | PS-19/20/22 | Vault không còn ở trạng thái Owner được phép sửa |
| `DMS_NOT_MONITORING` | 409 | PS-22 | Check-in/cấu hình khi DMS không ở trạng thái `MONITORING` (xem D-API-27) |
| `FILE_TYPE_NOT_ALLOWED` | 415 | PS-17 | Loại file ngoài danh sách cho phép (có thể dùng `UNSUPPORTED_MEDIA_TYPE`) |

Lỗi vi phạm quy tắc nghiệp vụ dùng HTTP **422** (D-API-19); xung đột trạng thái dùng **409**.

## 4. Quy tắc bắt buộc

1. **FE phân loại lỗi bằng `code` / `status`, không bằng `message`.** Message đổi theo ngôn ngữ và có thể được sửa chữ.
2. Response lỗi **không bao giờ** chứa: stack trace, tên exception, câu SQL, tên bảng/cột/schema, đường dẫn file,
   connection string, secret, mật khẩu, token. `server.error.include-*` đã tắt; handler chung chặn phần còn lại.
3. Chi tiết kỹ thuật chỉ ghi vào log server, gắn `traceId`. Người dùng báo lỗi → cung cấp `traceId` để tra log.
4. Ném `BusinessException(ErrorCode.X, args...)` từ Service; không `catch (Exception)` rồi trả `e.getMessage()`.
5. Lỗi 401/403 dùng đúng `ApiError` (có `code`, `traceId`, `errors: []`) — không trả HTML hay body rỗng.
6. `INVALID_CREDENTIALS` dùng chung cho mọi nguyên nhân đăng nhập sai để không lộ email nào tồn tại.
7. CORS từ chối (origin lạ) do Spring `CorsFilter` trả `403` không có body JSON; chỉ xảy ra khi gọi thẳng từ origin
   không được phép. Dev dùng proxy nên không gặp.

## 5. Cách FE xử lý (gợi ý)

```js
try { await request('/auth/login', { method: 'POST', body }) }
catch (e) {
  if (e.is('INVALID_CREDENTIALS')) showInline('Sai email hoặc mật khẩu')   // dùng code
  else if (e.is('VALIDATION_FAILED')) markFields(e.fieldErrors)             // errors[].field
  else if (e.status === 401) redirectToLogin()
  else showToast(e.message, e.traceId)                                      // message chỉ để hiển thị
}
```

Client dùng chung: `frontend/src/api/http.js` (`ApiError.code`, `.status`, `.traceId`, `.fieldErrors`).
