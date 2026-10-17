# Staff Verification Case — PS-34, PS-35 (ST-09)

Trạng thái: **đối chiếu theo source `Legacy_Vault(7).zip`; unit/integration runtime cần được xác nhận bằng kết quả test mới nhất**. Base path: `/api/v1/staff/verification-cases`. Controller yêu cầu role `STAFF_EXECUTOR` bằng `@PreAuthorize("hasRole('STAFF_EXECUTOR')")`.

## Quy tắc nghiệp vụ và phạm vi truy cập

- ST-09 tạo verification case sau khi Grace Period hết hạn; việc tạo case không đồng nghĩa đã xác nhận tử vong và không tự mở khóa/giải mã tài sản.
- Case mới có thể có `assignedStaffUserId = null` — chưa được Staff nhận.
- Quy trình hiện tại là **Staff tự nhận case**. Queue hiển thị case `OPEN` chưa được nhận và case đã được gán cho Staff đang đăng nhập.
- Staff được xem chi tiết case `OPEN` chưa được nhận trước khi claim. Case đã được gán cho Staff khác không được trả về.
- Claim chỉ thành công khi case còn `OPEN` và `assignedStaffUserId` vẫn là `null`. Repository thực hiện cập nhật có điều kiện; request cạnh tranh không thể cùng nhận thành công.
- Claim ghi `VERIFICATION_CASE_CLAIMED` qua `AuditService` trong transaction nghiệp vụ. Nếu audit insert thất bại, exception phải làm transaction claim rollback.

## GET /api/v1/staff/verification-cases — PS-35

- **Mục đích:** Lấy queue theo Staff đang đăng nhập, có thể lọc theo trạng thái và phân trang.
- **Authorization:** Controller có `@PreAuthorize("hasRole('STAFF_EXECUTOR')")`. Service lấy Staff ID bằng `CustomUserPrincipal.requireUserId(principal)`; không nhận `staffUserId` từ query string.
- **Query parameters:**

  | Trường | Kiểu | Bắt buộc | Validation / mặc định |
  |---|---|---|---|
  | `status` | string | Không | Null/rỗng thì không lọc; giá trị được `trim()` và chuyển thành chữ hoa. Service hiện chỉ chấp nhận `OPEN` hoặc `CANCELLED`. |
  | `page` | integer | Không | Mặc định `0`; `@Min(0)`. |
  | `size` | integer | Không | Mặc định `20`; `@Min(1)`, `@Max(100)`. |

  Ví dụ:

  ```http
  GET /api/v1/staff/verification-cases?status=OPEN&page=0&size=20
  ```

- **Repository:** `VerificationCaseRepository.findQueueByStaff(staffUserId, status, pageable)` chọn case đã gán cho Staff hiện tại hoặc case chưa gán có trạng thái `OPEN`; filter status được áp dụng nếu có. Thứ tự mặc định là `triggeredAt DESC`.
- **Response 200:** `PageResponse<StaffVerificationCaseResponse>`. Mỗi item có cấu trúc:

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

  `triggeredAt` và `closedAt` là `LocalDateTime`; định dạng JSON phụ thuộc cấu hình Jackson. Cấu trúc bao ngoài phân trang được định nghĩa bởi class `PageResponse`.

- **Lỗi:** `VALIDATION_FAILED` nếu `status` không hợp lệ. Mã lỗi HTTP cho lỗi validation của `page`/`size` cần được xác minh bằng controller integration test; unit test service không chứng minh response HTTP thực tế.

## GET /api/v1/staff/verification-cases/{caseId} — PS-35

- **Mục đích:** Lấy chi tiết case theo public UUID.
- **Path parameter:** `caseId` là UUID; giá trị sai định dạng được xử lý theo cơ chế malformed request của ứng dụng.
- **Authorization:** Role `STAFF_EXECUTOR` được kiểm tra ở cấp controller.
- **Quyền xem:** Service gọi `findViewableCaseByPublicId(caseId, staffUserId)`. Repository chỉ cho phép xem nếu case chưa được gán và đang `OPEN`, hoặc đã được gán cho Staff hiện tại.
- **Response 200:** Một `StaffVerificationCaseResponse` với `caseId`, `status`, `triggeredAt`, `closedAt`, `vaultId`, `vaultName`, `ownerId`, `ownerName`.
- **Lỗi:** `RESOURCE_NOT_FOUND` nếu case không tồn tại hoặc không thuộc phạm vi xem của Staff hiện tại. Nếu không tìm thấy Vault hoặc Owner liên quan, service cũng trả `RESOURCE_NOT_FOUND`.

## POST /api/v1/staff/verification-cases/{caseId}/claim — ST-09

- **Mục đích:** Staff tự nhận một case đang mở và chưa được gán.
- **Request body:** Không cần body; `caseId` nằm trên path.
- **Điều kiện thành công:** `publicId` khớp, `status = OPEN`, `assignedStaffUserId IS NULL`.
- **Xử lý:** `StaffVerificationCaseService.claimCase()` gọi `claimUnassignedCase()`. Nếu cập nhật đúng một hàng, service tải lại case theo `(publicId, assignedStaffUserId)`, ghi audit `VERIFICATION_CASE_CLAIMED`, rồi trả response. Query cập nhật cũng đặt `updatedAt = CURRENT_TIMESTAMP`.
- **Response 200:** `StaffVerificationCaseResponse` của case vừa nhận.
- **Lỗi:** `VERIFICATION_CASE_NOT_CLAIMABLE` (`409`) nếu không cập nhật được hàng nào vì case không tồn tại, đã được nhận hoặc không còn `OPEN`. Trường hợp tải lại không tìm thấy case trả `RESOURCE_NOT_FOUND` (`404`). `401`/`403` phụ thuộc cấu hình Spring Security.
- **Audit state:** Trước claim: `{"status":"OPEN","assignedStaffUserId":null}`. Sau claim: `{"status":"OPEN","assignedStaffUserId":<staffUserId>}`. `AuditService` chuẩn hóa state trước khi lưu để các cột state đáp ứng constraint JSON của SQL Server.
- **Transaction:** Audit phải ở cùng transaction với claim. Không chuyển audit claim sang `REQUIRES_NEW`; lỗi audit cần rollback việc gán Staff.

## Response DTO hiện tại

`StaffVerificationCaseResponse` là Java record với các trường:

| Trường | Kiểu Java |
|---|---|
| `caseId` | `UUID` |
| `status` | `String` |
| `triggeredAt` | `LocalDateTime` |
| `closedAt` | `LocalDateTime` |
| `vaultId` | `UUID` |
| `vaultName` | `String` |
| `ownerId` | `UUID` |
| `ownerName` | `String` |

Service lấy Vault bằng `vaultRepository.findById(verificationCase.getVaultId())`, sau đó lấy Owner bằng `userRepository.findById(vault.getOwnerUserId())`.

## PS-34 — Tạo Staff Verification Case từ ST-09

Hệ thống tạo case sau khi Grace Period hết hạn và chuyển Vault sang `AWAITING_VERIFICATION`. API trong tài liệu này là các endpoint đọc queue, đọc detail và claim; không phải endpoint tạo case. Cần kiểm tra processor/service DMS để xác nhận tạo case một lần và ghi audit `VERIFICATION_CASE_CREATED`.

Không xem việc tạo case là xác nhận tử vong hoặc tự động mở khóa/giải mã tài sản.

## Test và giới hạn xác minh

- Test `getCase_caseNotViewableByStaff_throwsNotFound` phải mock và verify `findViewableCaseByPublicId(caseId, staffUserId)`, không dùng method cũ `findByPublicIdAndAssignedStaffUserId()` để test `getCase()`.
- Unit test cần bao phủ queue, chuẩn hóa/validate status, xem ca chưa nhận, chặn xem ca của Staff khác, claim thành công, claim thất bại và audit được gọi.
- Integration Test cần dùng SQL Server để kiểm tra: hai Staff claim đồng thời chỉ một người thành công; audit insert thất bại rollback claim; `updatedAt` được cập nhật; JSON state thỏa constraint `ISJSON`.
- Chỉ ghi nhận test là pass khi có log Maven mới nhất. Mock audit không chứng minh SQL Server chấp nhận dữ liệu JSON.
