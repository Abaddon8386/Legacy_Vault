> **PS-102, 20/10/2026:** [COURT-only](court-only.md) supersedes conflicting NOTARIAL/write and will-MATCH requirements below. Legacy NOTARIAL is read-only.

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
  | `status` | string | Không | Null/rỗng thì không lọc; giá trị được `trim()` và chuyển thành chữ hoa. Service chấp nhận `OPEN`, `CANCELLED` hoặc `CLOSED`. |
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
    "caseNumber": "HS-2026-000001",
    "status": "OPEN",
    "triggeredAt": "2026-10-16T07:00:00",
    "closedAt": null,
    "vaultId": "9c1f0b6e-0000-4000-8000-000000000001",
    "vaultStatus": "AWAITING_VERIFICATION",
    "vaultName": "Kho di sản gia đình",
    "ownerId": "2c5d1a3e-0000-4000-8000-000000000001",
    "ownerName": "Nguyễn Văn A",
    "assignmentStatus": "UNASSIGNED_CLAIMABLE",
    "trustee": null
  }
  ```

  `triggeredAt` và `closedAt` là `LocalDateTime`; định dạng JSON phụ thuộc cấu hình Jackson. Cấu trúc bao ngoài phân trang được định nghĩa bởi class `PageResponse`. Queue trả `assignmentStatus` và `vaultStatus`, còn `trustee` bị bỏ trống trong các item danh sách; chi tiết trả Trustee hiện `APPOINTED` (chỉ tên, phone, email, quan hệ; không trả ghi chú).

- **Lỗi:** `VALIDATION_FAILED` nếu `status` không hợp lệ. Mã lỗi HTTP cho lỗi validation của `page`/`size` cần được xác minh bằng controller integration test; unit test service không chứng minh response HTTP thực tế.

## GET /api/v1/staff/verification-cases/{caseId} — PS-35

- **Mục đích:** Lấy chi tiết case theo public UUID.
- **Path parameter:** `caseId` là UUID; giá trị sai định dạng được xử lý theo cơ chế malformed request của ứng dụng.
- **Authorization:** Role `STAFF_EXECUTOR` được kiểm tra ở cấp controller.
- **Quyền xem:** Service gọi `findViewableCaseByPublicId(caseId, staffUserId)`. Repository chỉ cho phép xem nếu case chưa được gán và đang `OPEN`, hoặc đã được gán cho Staff hiện tại.
- **Response 200:** Một `StaffVerificationCaseResponse` với `caseId`, `status`, `triggeredAt`, `closedAt`, `vaultId`, `vaultName`, `ownerId`, `ownerName`.
- `Response 200` hiện bổ sung trạng thái phân công, trạng thái Vault và Trustee `APPOINTED` tối thiểu để liên hệ; ví dụ:

  ```json
  {
    "caseId": "6f1a4c2d-0000-4000-8000-000000000001",
    "caseNumber": "HS-2026-000001",
    "status": "OPEN",
    "triggeredAt": "2026-10-16T07:00:00",
    "closedAt": null,
    "vaultId": "9c1f0b6e-0000-4000-8000-000000000001",
    "vaultStatus": "AWAITING_VERIFICATION",
    "vaultName": "Kho di sản gia đình",
    "ownerId": "2c5d1a3e-0000-4000-8000-000000000001",
    "ownerName": "Nguyễn Văn A",
    "assignmentStatus": "ASSIGNED_TO_CURRENT_STAFF",
    "trustee": {
      "trusteeId": "b2f23e61-2c09-4ec7-9db7-148359db0001",
      "fullName": "Nguyễn Thị B",
      "phone": "+84900000000",
      "email": "trustee@example.test",
      "relationship": "Người thân"
    }
  }
  ```
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
| `vaultStatus` | `String` |
| `vaultName` | `String` |
| `ownerId` | `UUID` |
| `ownerName` | `String` |
| `assignmentStatus` | `UNASSIGNED_CLAIMABLE` hoặc `ASSIGNED_TO_CURRENT_STAFF` |
| `trustee` | `trusteeId`, `fullName`, `phone`, `email`, `relationship`; chỉ chi tiết; `null` khi không có Trustee APPOINTED |

### Nguồn context theo case và giới hạn

- `GET /{caseId}` giữ nguyên quyền: Staff hiện tại chỉ xem case OPEN chưa nhận hoặc case được gán cho chính mình; case của Staff khác trả 404.
- `vaultStatus` lấy trực tiếp từ Vault hiện hành. Đây là bước workflow, không phải quyền unlock/giao tài sản.
- Trustee lấy từ bản ghi hiện hành `APPOINTED` cùng Vault; không trả `note` hay giấy tờ định danh. Nếu thiếu Trustee, response trả `null`. Chính sách người liên hệ thay thế vẫn mở (C3: số lần/kênh/thời gian chờ), nên API không tự chọn fallback.
- Dữ liệu văn bản/phân bổ theo từng version được đọc qua `GET /api/v1/staff/verification-cases/{caseId}/basis-dossier` (đã giới hạn vào case được giao). Sau unlock, recipient/item đủ điều kiện được lấy qua `GET .../handover-sessions/{sessionId}/eligible-assets`; không dùng Owner Beneficiary API.
- Lịch sử death-document và bản di chúc giấy đã nhận được đọc qua các GET PS-38/39 hiện có; contact history qua PS-44. Các API này chỉ trả tham chiếu/metadata đã ghi, không chứng minh tự thân rằng Legal đã duyệt hay danh tính được xác minh.
- PS-106 adds a write-only counter attestation at `POST /api/v1/staff/verification-cases/{caseId}/beneficiaries/{beneficiaryId}/identity-attestations`. It records the authenticated Staff, server UTC time and an evidence reference in an append-only record; it does not accept `MATCH`, upload ID documents, OCR, echo the reference, or change the legacy identity-verification status. The reference is not itself proof that the referenced paper was checked. Delivery eligibility and use of this attestation by PS-62/63 remain separate decisions; the legacy client-result endpoint is not evidence for PS-106 delivery.

Service lấy Vault bằng `vaultRepository.findById(verificationCase.getVaultId())`, sau đó lấy Owner bằng `userRepository.findById(vault.getOwnerUserId())`.

## PS-34 — Tạo Staff Verification Case từ ST-09

Hệ thống tạo case sau khi Grace Period hết hạn và chuyển Vault sang `AWAITING_VERIFICATION`. API trong tài liệu này là các endpoint đọc queue, đọc detail và claim; không phải endpoint tạo case. Cần kiểm tra processor/service DMS để xác nhận tạo case một lần và ghi audit `VERIFICATION_CASE_CREATED`.

Không xem việc tạo case là xác nhận tử vong hoặc tự động mở khóa/giải mã tài sản.

## PS-38 — Ghi nhận giấy tờ khai tử đã nhận (ST-11, LV-DEATH-002)

Staff ghi nhận **metadata** giấy chứng tử / trích lục khai tử vật lý đã nhận từ Trustee. Chỉ là ghi nhận tiếp nhận:
**không** duyệt giấy tờ (ST-12 thuộc Legal), không đổi trạng thái Vault, không đóng ca, không tải file, không gọi VNeID.

Base path: `/api/v1/staff/verification-cases/{caseId}/death-documents`. Role `STAFF_EXECUTOR`. Staff phải là người **đã nhận ca**
(`assigned_staff_user_id`); ca chưa nhận hoặc của Staff khác → `404` (không lộ sự tồn tại).

| Thao tác | Mô tả |
|---|---|
| `POST` | Ghi nhận một giấy tờ. `201` + `Location` + `DeathDocumentRecordResponse` |
| `GET` | Danh sách giấy tờ đã ghi nhận của ca, mới nhất trước |
| `GET /{recordId}` | Một bản ghi |

**Request (`POST`):**

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `documentType` | string | có | `DEATH_CERTIFICATE` hoặc `DEATH_REGISTRATION_EXTRACT` (**đề xuất**, xem D-API-34) |
| `issuingAuthority` | string | có | không rỗng, ≤ 255 |
| `documentNumber` | string | có | không rỗng, ≤ 100 |
| `issuedDate` | date | có | `yyyy-MM-dd`, không ở tương lai |
| `evidenceReference` | string | không | ≤ 500; mã biên nhận/vị trí lưu hồ sơ giấy, **không phải file** |
| `notes` | string | không | ≤ 1000 |

`receivedBy` (Staff đăng nhập) và `receivedAt` (giờ máy chủ, UTC) do server đặt; request gửi hai trường này bị bỏ qua.

**Response:** `id`, `caseId`, `documentType`, `issuingAuthority`, `documentNumber`, `issuedDate`, `receivedBy` (ID công khai
của Staff), `receivedAt`, `evidenceReference`, `notes`.

- **Lỗi:** `400 VALIDATION_FAILED` · `401` · `403` (thiếu role) · `404` · `409 VERIFICATION_CASE_NOT_OPEN` (ca đã hủy/đóng).
- **Bất biến:** không có API sửa hay xóa; nhận thêm giấy tờ thì tạo bản ghi mới (AC-T06, LV-AUD-001).
- **Audit:** `DEATH_DOCUMENT_RECORDED` (ST-11, LV-DEATH-002) chỉ ghi loại giấy tờ và các ID công khai; **không** ghi số giấy tờ,
  cơ quan cấp hay ghi chú.
- **Chưa làm:** tiến độ hồ sơ `DEATH_DOCS_COLLECTED` chưa có cột chứa nên chưa được ghi (`TODO(open-question)`, D-API-34).

## PS-39 — Ghi nhận bản di chúc giấy gốc đã nộp (ST-13, LV-WILL-001)

Staff ghi nhận Trustee đã **nộp bản di chúc giấy gốc** tại quầy: ai giao, ai nhận, khi nào, bằng chứng và tình trạng. Chỉ là
ghi nhận việc nộp: **không** xác nhận di chúc hợp lệ, **không** đối chiếu với bản scan (việc của Legal), không đổi trạng thái
Vault hay ca, không tải file.

Base path: `/api/v1/staff/verification-cases/{caseId}/original-will-intakes`. Role `STAFF_EXECUTOR`; Staff phải là người **đã nhận
ca**, ca chưa nhận hoặc của Staff khác → `404`.

| Thao tác | Mô tả |
|---|---|
| `POST` | Ghi nhận một lần nộp. `201` + `Location` + `OriginalWillIntakeResponse` |
| `GET` | Các lần nộp của ca, mới nhất trước |
| `GET /{intakeId}` | Một bản ghi |

**Request (`POST`):**

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `deliveredByName` | string | có | không rỗng, ≤ 150 (người giao) |
| `deliveredByRelationship` | string | không | ≤ 100 (quan hệ với chủ kho) |
| `evidenceReference` | string | không | ≤ 500; mã biên nhận/vị trí lưu, **không phải file** |
| `conditionNotes` | string | không | ≤ 1000 (tình trạng bản gốc) |

`receivedBy` (Staff đăng nhập) và `receivedAt` (giờ máy chủ, UTC) do server đặt; gửi hai trường này bị bỏ qua.

**Response:** `id`, `caseId`, `deliveredByName`, `deliveredByRelationship`, `receivedBy`, `receivedAt`, `evidenceReference`,
`conditionNotes`.

- **Lỗi:** `400 VALIDATION_FAILED` · `401` · `403` · `404` · `409 VERIFICATION_CASE_NOT_OPEN`.
- **Bất biến:** không có API sửa hay xóa; nộp thêm thì tạo bản ghi mới.
- **Audit:** `ORIGINAL_WILL_RECEIVED` (ST-13, LV-WILL-001) chỉ ghi các ID công khai; **không** ghi tên người giao hay ghi chú tình trạng.
- **Chưa làm / chờ xác nhận (D-API-34):** tiến độ `WILL_AND_IDS_SUBMITTED` chưa có cột chứa; chưa bắt buộc ST-12 đã duyệt trước ST-13.
  Phần "giấy tờ nhân thân nhóm Beneficiary" của ST-13 không thuộc bảng `original_will_intakes` nên **chưa** nằm trong PS-39.

## Test và giới hạn xác minh

- Test `getCase_caseNotViewableByStaff_throwsNotFound` phải mock và verify `findViewableCaseByPublicId(caseId, staffUserId)`, không dùng method cũ `findByPublicIdAndAssignedStaffUserId()` để test `getCase()`.
- Unit test cần bao phủ queue, chuẩn hóa/validate status, xem ca chưa nhận, chặn xem ca của Staff khác, claim thành công, claim thất bại và audit được gọi.
- Integration Test cần dùng SQL Server để kiểm tra: hai Staff claim đồng thời chỉ một người thành công; audit insert thất bại rollback claim; `updatedAt` được cập nhật; JSON state thỏa constraint `ISJSON`.
- Chỉ ghi nhận test là pass khi có log Maven mới nhất. Mock audit không chứng minh SQL Server chấp nhận dữ liệu JSON.
