# Hợp đồng lỗi chung

PS-86 bổ sung mã lỗi cùng envelope VI/EN:

- 409 `BENEFICIARY_INVITATION_ALREADY_EXISTS` — `error.invitation.alreadyExists`;
  mã đã được cấp, GET metadata hoặc chủ động reissue.
- 409 `BENEFICIARY_INVITATION_ALREADY_USED` — `error.invitation.alreadyUsed`;
  không thu hồi/cấp lại generation đã dùng.
- 409 `BENEFICIARY_INVITATION_STALE` — `error.invitation.stale`;
  request reissue hoặc DELETE dùng generation cũ; tải metadata trước khi thử lại.
- 422 `BENEFICIARY_INVITATION_INVALID` — `error.invitation.invalid`;
  trả chung cho mã sai/hết hạn/thu hồi/đã dùng bởi account khác, invitation legacy chưa bind email,
  email binding không khớp hoặc account không đủ điều kiện. PS-87 authenticated redeem dùng mã này.
- 409 `BENEFICIARY_INVITATION_EMAIL_VERIFICATION_REQUIRED` —
  `error.invitation.emailVerificationRequired`; retained for redeem attempts against unbound/legacy invitations when
  the authenticated account has no verified database email. A current PS-106 Staff-bound invitation instead requires
  exact normalized account-email match to that generation's Staff-confirmed address; this does not set
  `email_verified_at` or prove mailbox control.
- 409 `BENEFICIARY_INVITATION_COUNTER_EMAIL_REQUIRED` — `error.invitation.counterEmailRequired`; no confirmed email
  was recorded on the Staff's latest in-person attestation for this case and recipient.
- 429 `TOO_MANY_ATTEMPTS` — `error.auth.tooManyAttempts`; either the account bucket or the account+invitation
  bucket has five failed redeem attempts in the previous fifteen minutes.

Owner sai kho vẫn dùng 404 `RESOURCE_NOT_FOUND`, Vault không ACTIVE dùng 409
`VAULT_NOT_EDITABLE`; hồ sơ đã link dùng `BENEFICIARY_ACCOUNT_ALREADY_LINKED`.

PS-44: `409 TRUSTEE_REVOKED` (`error.trustee.revoked`) khi Staff qua guard ca OPEN được giao nhưng
ghi liên hệ mới với Trustee đã REVOKED. Không tạo lịch sử/audit mới; lịch sử cũ vẫn đọc theo quyền ca.
Ngoài quyền ca vẫn trả 404 trước khi kiểm tra trạng thái Trustee.

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
| `INVALID_CREDENTIALS` | 401 | Sai email/mật khẩu; tài khoản đã xóa; Google subject chưa liên kết hoặc account Google không đủ điều kiện — **không phân biệt** |
| `INVALID_GOOGLE_CREDENTIAL` | 401 | Google ID token sai chữ ký/claim, hết hạn hoặc đã được dùng đổi phiên |
| `GOOGLE_SIGNIN_UNAVAILABLE` | 503 | Google Client ID chưa được cấu hình; đăng nhập email/mật khẩu vẫn hoạt động |
| `GOOGLE_IDENTITY_ALREADY_LINKED` | 409 | Google subject đã được liên kết với một tài khoản LegacyVault |
| `ACCESS_DENIED` | 403 | Đã đăng nhập nhưng thiếu role |
| `REAUTH_FAILED` | 403 | Nhập sai mật khẩu xác nhận khi xem nội dung bảo mật (D-API-32) hoặc khi sửa Asset (D-API-40). Không dùng 401 để FE không coi là hết phiên |
| `RESOURCE_NOT_FOUND` | 404 | Không có tài nguyên, **hoặc** không thuộc quyền người gọi (D-API-07) |
| `METHOD_NOT_ALLOWED` | 405 | Sai phương thức HTTP |
| `EMAIL_ALREADY_EXISTS` | 409 | Đăng ký trùng email |
| `TRUSTEE_ALREADY_EXISTS` | 409 | Vault đã có Trustee hiện hành |
| `VAULT_NOT_EDITABLE` | 409 | Vault hiện không cho phép Owner chỉnh sửa |
| `DMS_NOT_MONITORING` | 409 | Check-in (ngoài thời gian ân hạn) hoặc cấu hình khi DMS không ở `MONITORING` |
| `VERIFICATION_CASE_NOT_OPEN` | 409 | Ghi nhận chứng từ trên ca xác minh đã hủy/đóng (PS-38, PS-39) |
| `INTAKE_ATTACHMENT_LIMIT_EXCEEDED` | 409 | Giấy tờ đã đạt số tệp đính kèm tối đa (`legacyvault.intake.max-attachments-per-record`, PS-103, D-API-41) |
| `HANDOVER_SESSION_ALREADY_OPEN` | 409 | Ca đã có một handover session đang mở (PS-60) |
| `HANDOVER_SESSION_INVALID_STATE` | 409 | Case, Vault hoặc session không thỏa lifecycle PS-60 |
| `HANDOVER_RECEIPT_INVALID_STATE` | 409 | Session/Vault/legal workflow không cho phép lập receipt (PS-61) |
| `HANDOVER_VAULT_NOT_UNLOCKED` | 409 | Vault không ở `UNLOCKED`/`HANDOVER_IN_PROGRESS` khi bàn giao (PS-66) |
| `HANDOVER_RECIPIENT_NOT_ELIGIBLE` | 409 | Người nhận ngoài phạm vi Legal đã duyệt hoặc chưa `VERIFIED_AT_COUNTER` (PS-64, PS-65) |
| `HANDOVER_RECIPIENT_ACCOUNT_REQUIRED` | 409 | Người nhận chưa có tài khoản chính thức được liên kết nên chưa giao mới được (BE-02, D-API-47); không ghi gì |
| `HANDOVER_ASSET_NOT_ELIGIBLE` | 409 | Tài sản không thuộc phạm vi được duyệt cho người nhận (PS-65) |
| `HANDOVER_ASSET_ALREADY_DELIVERED` | 409 | Dòng phân bổ này đã được bàn giao (PS-65) |
| `BENEFICIARY_IDENTITY_NOT_VERIFIED` | 409 | Beneficiary chưa `VERIFIED_AT_COUNTER` nên chưa liên kết/tạo tài khoản (PS-62, PS-63) |
| `BENEFICIARY_ACCOUNT_ALREADY_LINKED` | 409 | Hồ sơ Beneficiary đã có tài khoản liên kết (PS-62, PS-63) |
| `BENEFICIARY_ACCOUNT_INELIGIBLE` | 409 | Tài khoản không hoạt động/đã xóa, là Owner của kho, có quyền Staff/Legal/Admin hoặc đã liên kết Beneficiary khác của cùng kho (PS-62) |
| `HANDOVER_RECEIPT_ASSET_NOT_ALLOCATED` | 409 | Recipient hoặc asset ngoài allocation Legal đã duyệt hiện hành (PS-61) |
| `HANDOVER_RECEIPT_RECIPIENT_NOT_VERIFIED` | 409 | Beneficiary chưa được xác minh trực tiếp tại quầy (PS-61) |
| `HANDOVER_RECEIPT_REISSUE_INVALID` | 409 | Receipt thay thế không cùng session/recipient hoặc đã có bản thay thế (PS-61) |
| `LEGAL_VERIFICATION_INVALID_STATE` | 409 | Legal quyết định khi ca không còn `OPEN` hoặc Vault không ở `AWAITING_VERIFICATION` (PS-36) |
| `LEGAL_VERIFICATION_ALREADY_DECIDED` | 409 | Giấy tờ khai tử đã có quyết định thẩm định (PS-36) |
| `WILL_NOT_VERIFIED` | 409 | Phân loại căn cứ khi chưa có kết quả đối chiếu di chúc khớp (PS-41) |
| `BASIS_DOSSIER_ALREADY_EXISTS` | 409 | Ca đã có hồ sơ căn cứ (PS-41) |
| `BASIS_DOSSIER_INVALID_STATE` | 409 | Ca, Vault hoặc hồ sơ căn cứ không ở trạng thái cho phép thao tác (PS-41, PS-42, PS-43) |
| `BASIS_VERSION_STALE` | 409 | Phiên bản được chuyển không phải phiên bản mới nhất của hồ sơ (PS-42) |
| ASSET_REQUIRED | 422 | Bật DMS khi Vault chưa có tài sản thừa kế |
| WILL_REQUIRED | 422 | Bật DMS khi Vault chưa có bản di chúc |
| `BENEFICIARY_REQUIRED` | 422 | Bật DMS khi Vault chưa có Beneficiary |
| `PAYLOAD_TOO_LARGE` | 413 | File/body vượt giới hạn |
| `ASSET_IMAGE_LIMIT_EXCEEDED` | 409 | Tải ảnh làm vượt giới hạn 5 ảnh của một tài sản |
| `ASSET_DOCUMENT_LIMIT_EXCEEDED` | 409 | Tải lên làm vượt số tài liệu đính kèm tối đa của một tài sản (`legacyvault.asset-documents.max-per-asset`, PS-114, D-API-43) |
| `ASSET_QUOTA_EXCEEDED` | 409 | Thao tác sẽ tăng số tài sản vượt giới hạn gói |
| `STORAGE_QUOTA_EXCEEDED` | 409 | Thao tác sẽ tăng dung lượng vượt giới hạn gói |
| `TOO_MANY_ATTEMPTS` | 429 | Quá số lần sai cho phép: mật khẩu xác nhận (D-API-32), hoặc PS-87 redeem theo bucket account và account+invitation trong 15 phút |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Định dạng nội dung/file không hỗ trợ |
| `INTERNAL_ERROR` | 500 | Mọi lỗi không lường trước. Luôn trả thông điệp chung |

## 3. Mã lỗi nghiệp vụ theo ticket

| `code` | HTTP | Ticket | Khi nào |
|---|---|---|---|
| `VAULT_ALREADY_EXISTS` | 409 | PS-12 | Owner đã có Vault (DB giới hạn mỗi Owner một Vault) |
| ASSET_REQUIRED | 422 | PS-21 | Hoàn tất cấu hình/bật DMS khi Vault chưa có tài sản thừa kế nào |
| WILL_REQUIRED | 422 | PS-21 | Hoàn tất cấu hình/bật DMS khi Vault chưa có bản di chúc nào |
| `BENEFICIARY_REQUIRED` | 422 | PS-21 | Hoàn tất cấu hình/bật DMS khi Vault chưa có Beneficiary nào |
| `TRUSTEE_ALREADY_EXISTS` | 409 | PS-19 | Vault đã có Trustee hiện hành khi tạo thêm |
| `VAULT_NOT_EDITABLE` | 409 | PS-19/20/22 | Vault không còn ở trạng thái Owner được phép sửa |
| `DMS_NOT_MONITORING` | 409 | PS-22 | Check-in (trừ khi `TRIGGERED` còn ân hạn)/cấu hình khi DMS không ở trạng thái `MONITORING` (xem D-API-27) |
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

PS-47: `COURT_EVIDENCE_REQUIRED` (409) khi thiếu văn bản tòa đã chuyển/metadata;
`COURT_DECISION_REQUIRED` (409) khi guard chưa có kết luận VALID mới nhất cho phiên bản hiện hành.

PS-48: `LEGAL_WORKFLOW_ON_HOLD` (409) khi guard phát hiện Vault/route đang ON_HOLD.

## PS-77 lifetime subscription / case evidence

- `SUBSCRIPTION_CATALOG_STALE` — 409, `error.subscription.catalogStale`: reload catalog before selecting a plan.
- `SUBSCRIPTION_DOWNGRADE_NOT_ALLOWED` — 409, `error.subscription.downgradeNotAllowed`: lifetime capacity cannot decrease.
- `CASE_EVIDENCE_QUOTA_EXCEEDED` — 409, `error.subscription.caseEvidenceQuotaExceeded`: case exceeds retained evidence bytes or version count; preserve existing history.

PS-77 blocker fix: 409 `SUBSCRIPTION_POLICY_PENDING` (`error.subscription.policyPending`)
for disabled/unapproved prototype APIs; 409 `SUBSCRIPTION_UPGRADE_UNAVAILABLE`
(`error.subscription.upgradeUnavailable`) for any valid self-upgrade request. No entitlement is granted.
`CASE_EVIDENCE_QUOTA_EXCEEDED` is reserved/inactive: PS-41 no longer emits this proposal-only error.

PS-57: `LEGAL_DECISION_STALE` (409, `error.legalApproval.snapshotStale`) when version, hash, allocation scope, or review snapshot no longer matches.

PS-58: `LEGAL_APPROVAL_REQUIRED` (409, `error.legalApproval.required`) when a protected transition has no matching current-version Legal approval. `LEGAL_DECISION_STALE` indicates that an existing review/approval snapshot no longer matches the current version, hash, dispute state, or allocation scope.

PS-80: `PAYMENT_REQUEST_CONFLICT` (409) — idempotency key đổi nội dung hoặc đang có checkout chưa hết hạn. Retry cùng key/body để nhận lại đơn. IPN dùng `{RspCode,Message}` theo [payments-vnpay.md](payments-vnpay.md).

PS-113: `BENEFICIARY_GUARDIAN_STALE` — HTTP 409, reload guardian context/revision before retry; messages VI/EN use `error.guardian.stale`.
## PS-112 recovery

400 RECOVERY_INVALID normalizes invalid/expired/used/revoked/ineligible credentials; 400 PASSWORD_POLICY is shared password policy rejection. DTO validation remains VALIDATION_FAILED (password field maps to FE PASSWORD_POLICY). 429 RATE_LIMITED has Retry-After:900; 503 RECOVERY_UNAVAILABLE covers missing email configuration or infrastructure failure without account-specific provider errors. No token/password/account status is echoed. See password-recovery.md.

## PS-116 email verification

400 `EMAIL_VERIFICATION_INVALID` normalizes unknown/expired/used/revoked/wrong-email/ineligible credentials (no oracle). 409 `EMAIL_ALREADY_VERIFIED` and 409 `EMAIL_VERIFICATION_NOT_APPLICABLE` are returned only to the authenticated owner of the account (no password login, e.g. Google-only). 429 `RATE_LIMITED` per account on request (60 s cooldown, 3/15 min, 5/24 h) and per IP on confirm (5/15 min); 503 `EMAIL_VERIFICATION_UNAVAILABLE` when verification mail is not enabled or infrastructure fails. See [email-verification.md](email-verification.md).

## BE-01 link requests
| Code | HTTP |
|---|---|
| `BENEFICIARY_LINK_REQUEST_INVALID` | 422 |
| `BENEFICIARY_LINK_REQUEST_ALREADY_PENDING` | 409 |
| `BENEFICIARY_LINK_REQUEST_LIMIT` | 429 |
| `BENEFICIARY_LINK_REQUEST_NOT_PENDING` | 409 |
| `BENEFICIARY_LEGACY_LINK_DISABLED` | 410 |

PS-119/120: GROUP_HANDOVER_BLOCKED (409, error.groupHandover.blocked) means missing/stale
attendance, active suspension or no current Staff reopen request. GROUP_HANDOVER_STALE
(409, error.groupHandover.stale) means revision mismatch or reused idempotency key with
different payload. Neither code discloses another account or changes business state.
