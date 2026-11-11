# Admin — tra cứu tài khoản (PS-109)

## Trạng thái

PS-109 bổ sung hai thao tác chỉ đọc. Mọi route yêu cầu Bearer JWT và `ROLE_ADMIN`; authorization được kiểm tra backend ở `/api/v1/admin/**` và controller. Không có API ghi trạng thái tài khoản trong contract này.

## Danh sách

`GET /api/v1/admin/users?page=0&size=20&query=alice&role=ROLE_ADMIN&status=ACTIVE`

- `page` bắt đầu từ 0; `size` từ 1 đến 100; mặc định 0/20.
- `query` tùy chọn, tìm chuỗi con không phân biệt hoa thường trong `fullName` hoặc `email`.
- `role` tùy chọn, lọc theo `roleCode` (ví dụ `ROLE_ADMIN`). Một user có nhiều role vẫn xuất hiện một lần.
- Khi lọc Owner, Beneficiary, Legal hoặc Staff, chỉ lấy tài khoản gốc `ACTIVE`/`LOCKED` chưa soft-delete. Điều kiện này nằm trong truy vấn DB trước phân trang. Tài khoản cũ `PENDING`/`DELETED` vẫn tra cứu được khi không lọc vai trò.
- `status` tùy chọn: `PENDING`, `ACTIVE`, `LOCKED`, `IN_PROCESS` hoặc `DELETED`, lọc theo `accountStatus` hiển thị. `DELETED` được suy ra từ `deleted_at`; trạng thái khác chỉ khớp user chưa soft-delete.
- `vaultStatus` tùy chọn: `NO_VAULT`, `ACTIVE`, `IN_PROCESS`, `ARCHIVED`; chỉ chấp nhận cùng `role=ROLE_VAULT_OWNER`, trường hợp khác trả `400 VALIDATION_FAILED`. Kết hợp độc lập với trạng thái tài khoản và lọc trong DB trước phân trang.
- `IN_PROCESS` gồm `AWAITING_VERIFICATION`, `DOCUMENT_VERIFICATION`, `WILL_VERIFICATION`, `AWAITING_LEGAL_BASIS`, `LEGAL_BASIS_VERIFICATION`, `ON_HOLD`, `UNLOCKED`, `HANDOVER_IN_PROGRESS`.
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
    "status": "ACTIVE",
    "accountStatus": "ACTIVE",
    "vaultStatus": null
  }],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1
}
```

## Chi tiết

`GET /api/v1/admin/users/{publicId}?role=ROLE_BENEFICIARY` (`role` tùy chọn) trả cùng một đối tượng user trong `content` (không bao envelope phân trang). Role truyền giống danh sách để tính trạng thái nhất quán cho tài khoản nhiều vai trò. ID sai định dạng trả `400 MALFORMED_REQUEST`; ID hợp lệ nhưng không tồn tại trả `404 RESOURCE_NOT_FOUND`.

Chi tiết có role Owner/Beneficiary/Legal/Staff cũng loại tài khoản `PENDING`/`DELETED` và trả `404 RESOURCE_NOT_FOUND`. Admin vẫn xem được chi tiết tài khoản cũ bằng request không có role. Truyền trạng thái lọc không được hỗ trợ bởi vai trò trả `400 VALIDATION_FAILED`.

Các response chỉ chứa public ID, tên, email, role codes, thời điểm tạo UTC, trạng thái xác thực gốc (`status`), trạng thái hiển thị (`accountStatus`), cùng `vaultStatus` cho Owner (`NO_VAULT` nếu chưa tạo kho, `null` với vai trò khác hoặc trạng thái chưa nhận diện). Frontend chỉ hiển thị cột và bộ lọc tình trạng kho khi lọc Chủ sở hữu kho; đổi vai trò sẽ xóa điều kiện lọc kho. Không trả khóa DB, password/hash, token, credential, nội dung kho hoặc `deletedAt`.

## Trạng thái hiển thị theo vai trò

Không ghi `IN_PROCESS` vào `users.status` hoặc thay đổi quyền đăng nhập. Tài khoản `LOCKED`, `PENDING` hoặc đã xóa giữ nguyên trạng thái. Chỉ tài khoản gốc `ACTIVE` mới có thể hiển thị `IN_PROCESS` nếu có ít nhất một kho liên quan ở một trong tám trạng thái xử lý nêu trên:

- `BENEFICIARY`: bản ghi thụ hưởng `DESIGNATED` đã liên kết đúng `linked_user_id`; không suy ra từ email hoặc lời mời chưa được chấp nhận.
- `STAFF_EXECUTOR`: được phân công trong verification case `OPEN` của kho.
- `LEGAL_VERIFIER`: đã ghi nhận nghiệp vụ Legal trong case `OPEN` hiện tại, audit có `occurred_at >= created_at` của case. Chỉ xem tài liệu, đăng nhập hoặc audit của case cũ không được tính. `HANDOVER_GROUP_CHANGED` chỉ tính thao tác `APPROVE`/`REJECT`.

Lọc một vai trò chỉ xét quan hệ của vai trò đó. Không lọc vai trò thì xét hợp ba vai trò trên; Owner/Admin không tự chuyển sang đang xử lý chỉ vì sở hữu kho hoặc có quyền quản trị. Có nhiều kho thì còn một kho liên quan đang xử lý vẫn là `IN_PROCESS`; không còn thì trở về `ACTIVE`. Cùng điều kiện được dùng cho bộ lọc trước phân trang và trạng thái hiển thị.

Với ba vai trò trên, cả danh sách, chi tiết theo vai trò và dropdown chỉ có `ACTIVE`, `LOCKED`, `IN_PROCESS`. Với Owner, chỉ có `ACTIVE`, `LOCKED`; tiến độ nằm riêng trong tình trạng kho. `PENDING`/`DELETED` chỉ còn trong danh sách không lọc vai trò hoặc danh sách Admin; không đổi trạng thái trong DB, không coi tài khoản cũ là đã khóa hay đang hoạt động. Đổi vai trò sẽ xóa trạng thái lọc không được hỗ trợ bởi vai trò mới.

`400` dùng ApiError chung cho tham số không hợp lệ; `401` cho request chưa xác thực; `403` cho người dùng đã xác thực nhưng không có `ROLE_ADMIN`. Ngôn ngữ message theo `Accept-Language` (VI mặc định, EN hỗ trợ).

## Khóa/mở khóa — đang chờ policy

Không triển khai mutation cho đến khi nhóm phê duyệt allowed transitions/account types, tài khoản nội bộ, self-lock, bảo vệ Admin cuối cùng, reason, token đã phát hành, concurrency/receipt, event audit và transaction. Filter JWT hiện tại đọc lại user từ DB và chặn user không `ACTIVE` hoặc đã soft-delete trên request bảo vệ; nhưng nếu tài khoản được chuyển lại `ACTIVE`, JWT chưa hết hạn có thể hoạt động lại. Chưa có token revocation/version để giải quyết chính sách đó.
