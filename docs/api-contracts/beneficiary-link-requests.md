# BE-01 — Tạo account và xác nhận liên kết tại quầy

Thay thế cách liên kết trực tiếp theo email của [beneficiary-accounts.md](beneficiary-accounts.md) (PS-62/PS-63).

## Luồng
1. Staff (ca `OPEN` của mình) tạo account **chưa liên kết**: `POST /api/v1/staff/verification-cases/{caseId}/accounts`
   `{email, fullName, password, phone?}` → `201 {accountId, linkStatus:"UNLINKED"}`. Mật khẩu do chính người nhận chọn, chỉ lưu hash,
   không log/audit. Email đã tồn tại → `409 EMAIL_ALREADY_EXISTS` (không dùng lại, không tự liên kết). Không cấp `ROLE_BENEFICIARY`.
2. Người nhận đăng nhập (không cần role Beneficiary) gửi mã hồ sơ `HS-yyyy-nnnnnn`:
   `POST /api/v1/beneficiary-link-requests {caseCode}` → `201 {requestId,status:"PENDING",createdAt,expiresAt}`.
   Chỉ tạo yêu cầu; không liên kết, không cấp quyền, không trả dữ liệu hồ sơ/kho/người nhận.
   Mã sai/không dùng được (không tồn tại, ca đóng/chưa nhận, sai năm, chủ kho, tài khoản nội bộ) → cùng một lỗi `422 BENEFICIARY_LINK_REQUEST_INVALID`.
   Đã có yêu cầu chờ cho ca đó → `409 BENEFICIARY_LINK_REQUEST_ALREADY_PENDING`; quá 5 yêu cầu chờ → `429 BENEFICIARY_LINK_REQUEST_LIMIT`.
   Hạn mặc định 7 ngày (`legacyvault.beneficiary.link-request-ttl-days`); yêu cầu quá hạn được đóng `EXPIRED` khi gửi lại.
3. `GET /api/v1/beneficiary-link-requests` (của chính mình) và `POST /api/v1/beneficiary-link-requests/{requestId}/cancel`
   (yêu cầu của người khác → `404`; không còn `PENDING` → `409 BENEFICIARY_LINK_REQUEST_NOT_PENDING`).
4. Staff đối chiếu giấy tờ tại quầy: `GET .../verification-cases/{caseId}/link-requests` (tên + email người gửi, chỉ yêu cầu còn hạn),
   rồi `POST .../link-requests/{requestId}/approve {beneficiaryId}` hoặc `POST .../reject`.
   Account đích luôn lấy từ yêu cầu đã lưu; body approve **không** nhận account/email. Recipient phải `VERIFIED_AT_COUNTER`, chưa liên kết,
   và account phải đủ điều kiện (cùng luật PS-62). Ca không thuộc Staff → `404`.

## Giao dịch, khóa, audit
Approve chạy một giao dịch: khóa account → Vault → ca → yêu cầu → recipient; cập nhật yêu cầu `APPROVED`, đặt `linked_user_id`, cấp `ROLE_BENEFICIARY`,
thu hồi mã mời `PENDING`, audit `BENEFICIARY_ACCOUNT_LINKED` + `BENEFICIARY_LINK_REQUEST_APPROVED`. Lỗi bất kỳ bước nào rollback toàn bộ.
Hai yêu cầu tranh một recipient: chỉ một liên kết (kiểm tra sau khóa + `UX_beneficiary_link_requests_approved` + chỉ mục `(vault_id, linked_user_id)`);
yêu cầu còn lại nhận `409 BENEFICIARY_ACCOUNT_ALREADY_LINKED` và vẫn `PENDING` để Staff từ chối.
Audit mới: `BENEFICIARY_ACCOUNT_CREATED_UNLINKED`, `BENEFICIARY_LINK_REQUESTED`, `BENEFICIARY_LINK_REQUEST_CANCELLED`, `_APPROVED`, `_REJECTED`.
Migration `V52__beneficiary_link_requests.sql` (additive).

## Tương thích
`POST /api/v1/staff/beneficiaries/{id}/account-link` và `/account` (liên kết theo email do client gửi) trả `410 BENEFICIARY_LEGACY_LINK_DISABLED`
trừ khi `legacyvault.beneficiary.legacy-counter-link-enabled=true` (mặc định `false`). Liên kết hiện có và lịch sử giữ nguyên.
Redeem mã mời PS-87/PS-106 giữ nguyên (đã ràng buộc email do Staff xác nhận tại quầy). Liên kết account không cấp quyền đọc tài sản chưa bàn giao.

## Demo/dev: bật tạm API cũ trong lúc chờ FE-01
Giao diện Staff hiện tại (`BeneficiaryAccountPage.jsx`, `LegacyCounterBeneficiariesSection.jsx` qua `beneficiaryAccountService.js`) vẫn gọi
`/staff/beneficiaries/{id}/account-link` và `/account`, nên sẽ nhận `410` cho tới khi FE-01 chuyển sang luồng yêu cầu liên kết.
Mặc định (kể cả production) giữ **tắt**. Chỉ môi trường demo/dev cục bộ mới bật, bằng đúng một trong các cách:
- `./mvnw spring-boot:run "-Dspring-boot.run.arguments=--legacyvault.beneficiary.legacy-counter-link-enabled=true"`
- `java -jar app.jar --legacyvault.beneficiary.legacy-counter-link-enabled=true`
- biến môi trường `SPRING_APPLICATION_JSON='{"legacyvault":{"beneficiary":{"legacy-counter-link-enabled":true}}}'`

Không đưa cờ này vào `application.yaml` hay cấu hình triển khai dùng chung. Cờ chỉ mở lại hai route cũ; luồng mới (`/link-requests`) vẫn luôn yêu cầu Staff xác nhận.
Gỡ cờ khi FE-01 xong.
