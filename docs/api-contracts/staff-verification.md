# Staff Verification Case — PS-34, PS-35 (ST-09)

Trạng thái: **đối chiếu theo các đoạn code được cung cấp; một số hành vi cần xác minh thêm bằng source/runtime**. Quyền ở Controller: `STAFF_EXECUTOR`. Base path: `/api/v1/staff/verification-cases`.

## GET /api/v1/staff/verification-cases — PS-35

- **Mục đích:** Lấy queue Staff Verification Case theo Staff đang đăng nhập, có thể lọc theo trạng thái và phân trang.
- **Authorization:** Controller có `@PreAuthorize("hasRole('STAFF_EXECUTOR')")`. Service lấy Staff ID bằng `CustomUserPrincipal.requireUserId(principal)`, không nhận `staffUserId` từ query string.
- **Query parameters:**

  | **Trường** | **Kiểu** | **Bắt buộc** | **Validation / mặc định** |
  | ---------- | -------- | ------------ | ------------------------- |
  | `status` | string | – | Nếu null/rỗng thì không lọc; nếu có giá trị thì `trim()` và chuyển thành chữ hoa |
  | `page` | integer | – | Mặc định `0`; `@Min(0)` |
  | `size` | integer | – | Mặc định `20`; `@Min(1)`, `@Max(100)` |

  Ví dụ:

  ```http
  GET /api/v1/staff/verification-cases?status=OPEN&page=0&size=20
  ```

- **Cách truy vấn:** `VerificationCaseRepository.findQueueByStaff(staffUserId, status, pageable)`. Repository chỉ chọn case có `assignedStaffUserId = staffUserId`; status được áp dụng khi khác null. Thứ tự mặc định là `triggeredAt DESC`.
- **Response 200:** `PageResponse<StaffVerificationCaseResponse>`. Item response theo record hiện tại:

  ```json
  {
    "caseId": "6f1a4c2d-0000-4000-8000-000000000001",
    "status": "OPEN",
    "triggeredAt": "2026-10-16T07:00:00",
    "closedAt": null,
    "vaultId": "9c1f0b6e-0000-4000-8000-000000000001",
    "vaultName": "Kho di sản gia đình",
    "ownerId": "2c5d1a3e-0000-4000-8000-000000000001",
    "ownerName": "Nguyễn Văn A"
  }
  ```

  `triggeredAt` và `closedAt` có kiểu Java `LocalDateTime`; định dạng JSON cụ thể phụ thuộc cấu hình Jackson của ứng dụng. Cấu trúc bao ngoài của `PageResponse` cần đối chiếu class `PageResponse` trước khi ghi cố định ví dụ phân trang.

- **Ví dụ một trang có nhiều entity:** Nếu gọi `?status=OPEN&page=0&size=2` và có 5 case phù hợp, `content` có thể chứa tối đa 2 object trong trang đầu tiên. Mỗi object là một `StaffVerificationCaseResponse` độc lập; FE cần lặp qua mảng `content` để hiển thị từng case.

  ```json
  {
    "content": [
      {
        "caseId": "11111111-1111-4111-8111-111111111111",
        "status": "OPEN",
        "triggeredAt": "2026-10-16T07:00:00",
        "closedAt": null,
        "vaultId": "22222222-2222-4222-8222-222222222222",
        "vaultName": "Kho di sản gia đình A",
        "ownerId": "33333333-3333-4333-8333-333333333333",
        "ownerName": "Nguyễn Văn A"
      },
      {
        "caseId": "44444444-4444-4444-8444-444444444444",
        "status": "OPEN",
        "triggeredAt": "2026-10-15T09:00:00",
        "closedAt": null,
        "vaultId": "55555555-5555-4555-8555-555555555555",
        "ownerId": "66666666-6666-4666-8666-666666666666",
        "vaultName": "Kho di sản gia đình B",
        "ownerName": "Trần Văn B"
      }
    ],
    "page": 0,
    "size": 2,
    "totalElements": 5,
    "totalPages": 3
  }
  ```

  Trong ví dụ trên, `content` có 2 entity vì `size=2`; `totalElements=5` là tổng số case khớp bộ lọc trên tất cả các trang; `totalPages=3` là tổng số trang. Đây là JSON minh họa cho FE, không phải response lấy trực tiếp từ server. Hãy xác nhận tên và cấu trúc trường phân trang với class `PageResponse` trong code trước khi coi là contract cuối cùng.

- **Lỗi/validation:** Controller có `@Validated` và ràng buộc `@Min`/`@Max`. `GlobalExceptionHandler` xử lý `HandlerMethodValidationException` thành `VALIDATION_FAILED`, nhưng test hiện tại cho thấy `ConstraintViolationException` được ném ra từ method validation. Handler được cung cấp chưa có nhánh riêng cho `ConstraintViolationException`; exception này có thể rơi vào handler tổng quát `Exception` và thành `INTERNAL_ERROR` nếu không được chuyển đổi ở nơi khác. Cần kiểm tra bằng integration test trước khi cam kết mã lỗi HTTP cho `page`/`size` không hợp lệ.
- **Lỗi khác:** `401`/`403` phụ thuộc cấu hình Spring Security và `AccessDeniedException` handler hiện có. `status` không khớp giá trị trong DB/enum không được validate rõ ràng ở Controller; repository chỉ so sánh chuỗi trạng thái.

## GET /api/v1/staff/verification-cases/{caseId} — PS-35

- **Mục đích:** Lấy chi tiết một case theo public UUID.
- **Path parameter:**

  | **Trường** | **Kiểu** | **Bắt buộc** | **Validation / ý nghĩa** |
  | ---------- | -------- | ------------ | ------------------------- |
  | `caseId` | UUID | ✔ | Spring chuyển path segment sang `UUID`; giá trị sai định dạng thường gây `400` qua xử lý malformed request |

- **Authorization:** Cùng `@PreAuthorize("hasRole('STAFF_EXECUTOR')")` ở cấp Controller.
- **Ownership/phạm vi truy cập:** Service truy vấn bằng `findByPublicIdAndAssignedStaffUserId(caseId, staffUserId)`. Nếu case không tồn tại hoặc không được phân công cho Staff hiện tại, ném `BusinessException(ErrorCode.RESOURCE_NOT_FOUND)`.
- **Response 200:** Một `StaffVerificationCaseResponse` với các trường `caseId`, `status`, `triggeredAt`, `closedAt`, `vaultId`, `vaultName`, `ownerId`, `ownerName`.
- **Lỗi:** `RESOURCE_NOT_FOUND` cho case không tồn tại hoặc không thuộc Staff hiện tại. Mã HTTP cụ thể lấy từ cấu hình `ApiErrorFactory`/`ErrorCode`. Lỗi quyền truy cập Controller được xử lý theo cấu hình Security và `GlobalExceptionHandler`.

## Response DTO hiện tại

`StaffVerificationCaseResponse` là Java record với các trường:

| Trường | Kiểu Java |
| --- | --- |
| `caseId` | `UUID` |
| `status` | `String` |
| `triggeredAt` | `LocalDateTime` |
| `closedAt` | `LocalDateTime` |
| `vaultId` | `UUID` |
| `vaultName` | `String` |
| `ownerId` | `UUID` |
| `ownerName` | `String` |

Service lấy dữ liệu Vault bằng `vaultRepository.findById(verificationCase.getVaultId())`, sau đó lấy Owner bằng `userRepository.findById(vault.getOwnerUserId())`. Nếu không tìm thấy Vault hoặc Owner, service cũng ném `RESOURCE_NOT_FOUND`.

## PS-34 — Tạo Staff Verification Case từ ST-09

Theo Main Flow ST-09, hệ thống tạo case/task sau khi Grace Period hết hạn và chuyển Vault sang `AWAITING_VERIFICATION`. Các đoạn Controller/Service/Repository được cung cấp ở đây **không thể hiện endpoint tạo case**; chúng chỉ thể hiện API đọc queue và đọc detail. Cơ chế tạo case, thời điểm kích hoạt và phân công Staff Executor phải được xác nhận trong các processor/service của DMS và code tạo `VerificationCase`.

Không được xem việc tạo case là xác nhận tử vong hoặc tự động mở khóa/giải mã tài sản.

## Quy tắc authorization được thể hiện trong code

1. Controller yêu cầu role `STAFF_EXECUTOR`.
2. Service lấy user ID từ `CustomUserPrincipal.requireUserId(principal)`.
3. Queue chỉ truy vấn case có `assignedStaffUserId` khớp Staff hiện tại.
4. Detail truy vấn theo cặp `(publicId, assignedStaffUserId)`, tránh trả case của Staff khác.
5. Service đọc thông tin Vault và Owner để tạo response; nếu không tìm thấy một trong hai thì trả `RESOURCE_NOT_FOUND`.

## Test hiện có và giới hạn

Theo log Maven đã cung cấp, `StaffVerificationCaseControllerTest` chạy 2 test và `StaffVerificationCaseServiceTest` chạy 4 test; tổng cộng 6 test pass. Hai test pagination không hợp lệ hiện kiểm tra `ServletException` có nguyên nhân là `ConstraintViolationException`. Chúng **không kiểm tra response HTTP 400**.

Các test đã pass không tự chứng minh mọi nhánh authorization, lọc status, phân trang, hoặc tạo case PS-34 đã được kiểm thử. Cần đối chiếu các method test còn lại để ghi nhận chính xác coverage.
