# Admin — quản lý tài khoản (PS-109 tra cứu; tạo tài khoản và đổi vai trò)

## Trạng thái

PS-109 bổ sung hai thao tác chỉ đọc (danh sách, chi tiết). Admin còn có thể tạo tài khoản và đổi vai trò Staff/Legal/Vault Owner (mục cuối). Mọi route yêu cầu Bearer JWT và `ROLE_ADMIN`; authorization được kiểm tra backend ở `/api/v1/admin/**` và controller. Không có API khóa/mở khóa trạng thái tài khoản trong contract này.

## Danh sách

`GET /api/v1/admin/users?page=0&size=20&query=alice&role=ROLE_ADMIN&status=ACTIVE`

- `page` bắt đầu từ 0; `size` từ 1 đến 100; mặc định 0/20.
- `query` tùy chọn, tìm chuỗi con không phân biệt hoa thường trong `fullName` hoặc `email`.
- `role` tùy chọn, lọc theo `roleCode` (ví dụ `ROLE_ADMIN`). Một user có nhiều role vẫn xuất hiện một lần.
- `status` tùy chọn: `PENDING`, `ACTIVE` hoặc `DELETED`. `DELETED` là trạng thái hiệu lực được suy ra từ `deleted_at`; trạng thái khác chỉ khớp user chưa soft-delete.
- Kết quả dùng envelope chung `content/page/size/totalElements/totalPages`, sắp xếp `createdAt` giảm dần.

Ví dụ `200`:

```json
{
  "content": [{
    "publicId": "f2b8c4ef-f28b-4cea-9911-052a57c04d17",
    "fullName": "Alice Nguyen",
    "email": "alice@example.test",
    "roles": ["ROLE_BENEFICIARY"],
    "createdAt": "2026-10-20T11:30:00Z",
    "status": "ACTIVE"
  }],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1
}
```

## Chi tiết

`GET /api/v1/admin/users/{publicId}` trả cùng một đối tượng user trong `content` (không bao envelope phân trang). ID sai định dạng trả `400 MALFORMED_REQUEST`; ID hợp lệ nhưng không tồn tại trả `404 RESOURCE_NOT_FOUND`.

Các response chỉ chứa public ID, tên, email, role codes, thời điểm tạo UTC và trạng thái hiệu lực. Không trả khóa DB, password/hash, token, credential, dữ liệu vault hoặc `deletedAt`.

`400` dùng ApiError chung cho tham số không hợp lệ; `401` cho request chưa xác thực; `403` cho người dùng đã xác thực nhưng không có `ROLE_ADMIN`. Ngôn ngữ message theo `Accept-Language` (VI mặc định, EN hỗ trợ).

## Tạo tài khoản

`POST /api/v1/admin/users` → `201` + đối tượng user (cùng shape với chi tiết).

```json
{ "fullName": "Nguyen Staff", "email": "staff@example.test", "phone": "", "password": "…", "role": "ROLE_STAFF_EXECUTOR" }
```

- `role` chỉ nhận `ROLE_STAFF_EXECUTOR`, `ROLE_LEGAL_VERIFIER`, `ROLE_VAULT_OWNER` (tiền tố `ROLE_` tùy chọn). `ROLE_ADMIN`, `ROLE_BENEFICIARY` hoặc giá trị lạ trả `400 ADMIN_ROLE_NOT_ASSIGNABLE`.
- Email chuẩn hóa như đăng ký thường (trim + lower-case); trùng trả `409 EMAIL_ALREADY_EXISTS`.
- Mật khẩu ban đầu 8–72 ký tự theo chính sách chung; Admin chuyển cho người dùng qua kênh an toàn. Mật khẩu chỉ được băm và lưu, không bao giờ xuất hiện trong response, audit hoặc log.
- Tài khoản ở trạng thái `ACTIVE`; `emailVerifiedAt` để trống (chưa xác minh email).
- Audit `ADMIN_USER_CREATED` (actor = Admin, entity `USER` = tài khoản mới).

## Đổi vai trò

`PUT /api/v1/admin/users/{publicId}/role` với `{ "role": "ROLE_LEGAL_VERIFIER" }` → `200` + user sau khi đổi.

- Thay thế mọi role Staff/Legal/Vault Owner hiện có bằng role được gửi; role khác (ví dụ `ROLE_BENEFICIARY`) giữ nguyên. Gửi lại đúng role hiện tại là no-op, không ghi audit.
- Có hiệu lực ngay (role đọc từ DB ở mỗi request); không cần đăng nhập lại.
- `409 ADMIN_ACCOUNT_PROTECTED`: tài khoản đích là Admin hoặc chính người gọi.
- `409 ADMIN_OWNER_HAS_VAULT`: đang là Vault Owner và đã có kho, không được đổi sang role khác.
- `404 RESOURCE_NOT_FOUND`: không tồn tại, đã xóa mềm hoặc không `ACTIVE`.
- Audit `ADMIN_USER_ROLE_CHANGED` với role trước/sau.
- Chưa xử lý: Staff/Legal đang giữ hồ sơ (claimed case) khi bị đổi role — case giữ nguyên người được gán.

## Khóa/mở khóa — đang chờ policy

Không triển khai mutation cho đến khi nhóm phê duyệt allowed transitions/account types, tài khoản nội bộ, self-lock, bảo vệ Admin cuối cùng, reason, token đã phát hành, concurrency/receipt, event audit và transaction. Filter JWT hiện tại đọc lại user từ DB và chặn user không `ACTIVE` hoặc đã soft-delete trên request bảo vệ; nhưng nếu tài khoản được chuyển lại `ACTIVE`, JWT chưa hết hạn có thể hoạt động lại. Chưa có token revocation/version để giải quyết chính sách đó.
