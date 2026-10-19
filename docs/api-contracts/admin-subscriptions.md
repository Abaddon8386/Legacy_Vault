# PS-82 — Quản lý danh mục gói sử dụng và phiên bản trên Admin

Tài liệu này xác định API contract, quyền hạn, quy tắc nghiệp vụ phiên bản và ranh giới tích hợp cho tính năng quản lý gói sử dụng trên giao diện Quản trị viên (Admin) của LegacyVault theo kết quả thẩm định cập nhật của PS-82.

Nguồn đối chiếu và liên quan:
- [open-decisions.md §G](open-decisions.md#g-ps-77--đề-xuất-chờ-phê-duyệt-của-nhóm-2026-10-17)
- [subscriptions.md](subscriptions.md) (PS-77 — chính sách subscription và quota)
- [error-contract.md](error-contract.md)
- [audit.md](audit.md)
- Phụ thuộc thanh toán: PS-80 (Payment Gateways / VNPay / MoMo)

---

## 1. Mô hình Gói & Bảng giá theo PS-82

| Mã gói (Code) | Tên tiếng Việt | Tên tiếng Anh | Giá mua (VND) | Hạn mức tài sản | Dung lượng lưu trữ | Tệp tối đa | Chu kỳ (Billing) |
|---|---|---|---|---|---|---|---|
| **BASIC** | Cơ bản | Basic Plan | **0 ₫** (Miễn phí) | 5 tài sản | 100 MB (104.857.600 B) | 10 MB (10.485.760 B) | LIFETIME |
| **STANDARD** | Tiêu chuẩn | Standard Plan | **499.000 ₫** | 50 tài sản | 1 GB (1.073.741.824 B) | 10 MB (10.485.760 B) | LIFETIME |
| **EXTENDED** | Mở rộng | Extended Plan | **999.000 ₫** | 200 tài sản | 5 GB (5.368.709.120 B) | 10 MB (10.485.760 B) | LIFETIME |

### Quy tắc mô hình gói:
1. **Giá mới được duyệt ngày 19/10/2026**: STANDARD 499.000đ, EXTENDED 999.000đ; các mức giá và chu kỳ trước đó chỉ là lịch sử.
2. **Mua một lần, sử dụng trọn đời**: Catalog bán mới dùng `LIFETIME`, BASIC miễn phí, STANDARD 499.000đ và EXTENDED 999.000đ. Nâng cấp thanh toán toàn bộ giá gói đích, không khấu trừ khoản đã mua. Quyết định trực tiếp của người dùng ngày 19/10/2026 thay yêu cầu theo tháng trước đó.
3. **Giới hạn tệp cố định 10 MB**: Hạn mức file tối đa cố định `10.485.760 bytes` theo đơn vị nhị phân chuẩn của dự án; không cho phép nâng lên qua API request.
4. **Không có quota người thụ hưởng**: Giữ nguyên thiết kế không giới hạn số lượng người thụ hưởng.
5. **Không bypass chính sách**: Không bật cờ prototype để bỏ qua trạng thái `SUBSCRIPTION_POLICY_PENDING`.

---

## 2. Phân quyền và Bảo mật (Role Matrix)

| Endpoint | Method | Vai trò cho phép | Vai trò bị từ chối | Ghi chú bảo mật |
|---|---|---|---|---|
| `/api/v1/admin/subscriptions/plans` | GET | `ROLE_ADMIN` | Khác: 403, Chưa đăng nhập: 401 | Danh sách tóm tắt 3 gói |
| `/api/v1/admin/subscriptions/plans/{planCode}` | GET | `ROLE_ADMIN` | Khác: 403, Chưa đăng nhập: 401 | Chi tiết gói + toàn bộ lịch sử phiên bản |
| `/api/v1/admin/subscriptions/plans/{planCode}/versions` | GET | `ROLE_ADMIN` | Khác: 403, Chưa đăng nhập: 401 | Danh sách phiên bản của một gói |
| `/api/v1/admin/subscriptions/plans/{planCode}/versions/{version}` | GET | `ROLE_ADMIN` | Khác: 403, Chưa đăng nhập: 401 | Chi tiết một phiên bản cấu hình |
| `/api/v1/admin/subscriptions/plans/{planCode}/versions` | POST | `ROLE_ADMIN` | Khác: 403, Chưa đăng nhập: 401 | Tạo bản nháp mới kế thừa phiên bản nguồn (Status: DRAFT) |
| `/api/v1/admin/subscriptions/plans/{planCode}/versions/{version}` | PUT | `ROLE_ADMIN` | Khác: 403, Chưa đăng nhập: 401 | Cập nhật bản nháp (optimistic concurrency token) |
| `/api/v1/admin/subscriptions/plans/{planCode}/versions/{version}/publish` | POST | `ROLE_ADMIN` | Khác: 403, Chưa đăng nhập: 401 | Công bố bản nháp thành phiên bản áp dụng chính thức |
| `/api/v1/admin/subscriptions/plans/{planCode}/versions/{version}/deprecate` | POST | `ROLE_ADMIN` | Khác: 403, Chưa đăng nhập: 401 | Ngừng áp dụng phiên bản cho lựa chọn mới |
| `/api/v1/admin/subscriptions/accounts` | GET | `ROLE_ADMIN` | Khác: 403, Chưa đăng nhập: 401 | Tra cứu chỉ đọc gói hiệu lực & mức dùng thật qua query |
| `/api/v1/admin/subscriptions/transactions` | GET | `ROLE_ADMIN` | Khác: 403, Chưa đăng nhập: 401 | Tra cứu giao dịch; trả 409 khi PS-80 chưa sẵn sàng |

### Nguyên tắc Quyền hạn và Bảo toàn dữ liệu:
1. **Admin Catalog Management**: Admin chỉ quản lý định nghĩa gói trong danh mục (tên, giá, hạn mức, trạng thái phát hành). Không mặc nhiên có quyền tự cấp/thu hồi/đổi gói thủ công, miễn phí gói cho tài khoản hoặc sửa đổi snapshot giao dịch lịch sử.
2. **Không xâm phạm dữ liệu riêng tư**: Tuyệt đối không cho phép Admin xem nội dung kho riêng của Owner, không giải mã dữ liệu, không can thiệp vào vai trò Staff/Legal/Beneficiary.
3. **Bảo toàn Audit**: Mọi thao tác DRAFT, PUBLISH, DEPRECATE đều ghi nhận audit log không thể thu hồi hoặc xóa bỏ. Lỗi audit sẽ rollback toàn bộ nghiệp vụ trong transaction.
4. **Không Hard-delete**: Không thực hiện `DELETE` vật lý đối với bất kỳ phiên bản gói nào đã tồn tại trong DB.

---

## 3. Kiểm soát Đồng thời & Toàn vẹn Dữ liệu (Concurrency Control)

Bảng quản lý: `dbo.subscription_plan_versions` (migration Flyway `V28__admin_subscription_catalog_management.sql`).

### Cơ chế chống ghi đè:
- Cột `concurrency_token BIGINT NOT NULL` được JPA quản lý thông qua `@Version`.
- Request `PUT /api/v1/admin/subscriptions/plans/{planCode}/versions/{version}` bắt buộc gửi trường `concurrencyToken` (Long).
- Nếu `concurrencyToken` không khớp hoặc JPA phát hiện phiên bản đã bị sửa đổi bởi giao dịch khác, API trả mã lỗi 409 `PLAN_VERSION_CONFLICT`.
- Frontend nhận mã lỗi `PLAN_VERSION_CONFLICT` và hiển thị thông báo kèm nút "Tải lại dữ liệu" để người dùng cập nhật phiên bản mới nhất.

### Ràng buộc trạng thái ở mức DB Engine:
- **Tối đa 1 bản DRAFT / gói**: Ràng buộc Filtered Unique Index:
  ```sql
  CREATE UNIQUE NONCLUSTERED INDEX UQ_sub_plan_versions_draft
  ON dbo.subscription_plan_versions (plan_code)
  WHERE status = N'DRAFT';
  ```
- **Tối đa 1 bản PUBLISHED / gói**: Ràng buộc Filtered Unique Index:
  ```sql
  CREATE UNIQUE NONCLUSTERED INDEX UQ_sub_plan_versions_published
  ON dbo.subscription_plan_versions (plan_code)
  WHERE status = N'PUBLISHED';
  ```
- Xung đột tạo draft hoặc publish đồng thời sẽ bị SQL Server chặn và Backend bọc `DataIntegrityViolationException` thành HTTP 409 (`PLAN_VERSION_ALREADY_EXISTS` hoặc `PLAN_VERSION_CONFLICT`), không để lộ lỗi 500.

---

## 4. Chi tiết API Endpoints

### 4.1. Danh sách gói sử dụng
- **URL**: `GET /api/v1/admin/subscriptions/plans`
- **Response 200**:
```json
[
  {
    "planCode": "STANDARD",
    "nameVi": "Tiêu chuẩn",
    "nameEn": "Standard Plan",
    "activeVersion": 1,
    "activePriceVnd": 499000,
    "activeBillingModel": "LIFETIME",
    "activeStatus": "PUBLISHED",
    "hasDraft": true,
    "draftVersion": 2,
    "totalVersions": 2,
    "limits": {
      "assetCount": 50,
      "storageBytes": 1073741824,
      "fileBytes": 10485760
    }
  }
]
```

### 4.2. Chi tiết gói và lịch sử phiên bản
- **URL**: `GET /api/v1/admin/subscriptions/plans/{planCode}`
- **Response 200**:
```json
{
  "planCode": "STANDARD",
  "nameVi": "Tiêu chuẩn",
  "nameEn": "Standard Plan",
  "activeVersion": 1,
  "versions": [
    {
      "id": 2,
      "planCode": "STANDARD",
      "version": 2,
      "status": "DRAFT",
      "nameVi": "Tiêu chuẩn (Bản nháp)",
      "nameEn": "Standard Plan (Draft)",
      "descriptionVi": "Bản nháp đề xuất nâng cấp nội dung hiển thị cho chu kỳ mới.",
      "descriptionEn": "Proposed draft for updated display metadata in new billing cycle.",
      "purchasePriceVnd": 499000,
      "billingModel": "LIFETIME",
      "assetLimit": 50,
      "storageBytesLimit": 1073741824,
      "fileBytesLimit": 10485760,
      "concurrencyToken": 0,
      "changeNotes": "Khởi tạo bản nháp cấu hình cho kỳ tiếp theo",
      "publishedAt": null,
      "publishedByUserId": null,
      "createdAt": "2026-10-19T06:00:00Z",
      "updatedAt": "2026-10-19T06:00:00Z"
    }
  ]
}
```

### 4.3. Tạo bản nháp mới
- **URL**: `POST /api/v1/admin/subscriptions/plans/{planCode}/versions`
- **Request Body**:
```json
{
  "sourceVersionId": 1,
  "changeNotes": "Đề xuất cập nhật mô tả chu kỳ mới"
}
```
- **Response 201**: Chi tiết bản nháp `SubscriptionPlanVersionDto` vừa tạo (phiên bản = `max(version) + 1`, status = `DRAFT`).
- **Error Codes**:
  - 400 `VALIDATION_FAILED`
  - 404 `PLAN_VERSION_NOT_FOUND`
  - 409 `PLAN_VERSION_ALREADY_EXISTS` (gói đã có bản nháp chưa công bố)

### 4.4. Cập nhật bản nháp
- **URL**: `PUT /api/v1/admin/subscriptions/plans/{planCode}/versions/{version}`
- **Request Body**:
```json
{
  "nameVi": "Tiêu chuẩn",
  "nameEn": "Standard Plan",
  "descriptionVi": "Mô tả tiếng Việt",
  "descriptionEn": "English description",
  "purchasePriceVnd": 499000,
  "billingModel": "LIFETIME",
  "assetLimit": 50,
  "storageBytesLimit": 1073741824,
  "fileBytesLimit": 10485760,
  "concurrencyToken": 0,
  "changeNotes": "Cập nhật mô tả hiển thị"
}
```
- **Response 200**: Thông tin bản nháp đã cập nhật (`concurrencyToken` tự động tăng lên 1).
- **Error Codes**:
  - 400 `VALIDATION_FAILED` (fileBytesLimit != 10MB, giá < 0, billingModel != LIFETIME)
  - 404 `PLAN_VERSION_NOT_FOUND`
  - 409 `PLAN_VERSION_NOT_EDITABLE` (phiên bản không ở trạng thái DRAFT)
  - 409 `PLAN_VERSION_CONFLICT` (concurrency token không khớp)

### 4.5. Công bố phiên bản
- **URL**: `POST /api/v1/admin/subscriptions/plans/{planCode}/versions/{version}/publish`
- **Response 200**: Phiên bản chuyển sang trạng thái `PUBLISHED`. Phiên bản cũ tự động chuyển `DEPRECATED`. Đồng bộ sang bảng hiện hành `dbo.subscription_plans`.
- **Error Codes**:
  - 404 `PLAN_VERSION_NOT_FOUND`
  - 409 `PLAN_VERSION_NOT_EDITABLE` (chỉ bản nháp DRAFT mới được công bố)
  - 409 `PLAN_VERSION_CONFLICT`

### 4.6. Ngừng áp dụng phiên bản
- **URL**: `POST /api/v1/admin/subscriptions/plans/{planCode}/versions/{version}/deprecate`
- **Response 200**: Phiên bản chuyển sang trạng thái `DEPRECATED`.
- **Error Codes**:
  - 404 `PLAN_VERSION_NOT_FOUND`
  - 409 `PLAN_VERSION_NOT_EDITABLE` (phiên bản đã DEPRECATED hoặc đang là DRAFT)

### 4.7. Tra cứu tài khoản và Mức dùng thật (Real Usage)
- **URL**: `GET /api/v1/admin/subscriptions/accounts?query={accountId|username|email|publicUuid}`
- **Mục đích**: Tra cứu chỉ đọc (read-only) tình trạng gói và hạn mức thực tế của tài khoản từ database.
- **Quy tắc gói hiệu lực**:
  - Mọi tài khoản hiện hành tuân thủ chính sách gói mặc định `BASIC` (miễn phí), không gán quyền trả phí trọn đời giả mạo.
  - `effectiveUntil: null` (gói miễn phí không thời hạn).
  - `entitlementStatus: "DEFAULT_BASIC_FREE"`.
- **Response 200**:
```json
{
  "accountId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "username": "owner1",
  "email": "owner1@legacyvault.local",
  "role": "ROLE_VAULT_OWNER",
  "effectivePlanCode": "BASIC",
  "effectivePlanName": "Gói Cơ bản (Mặc định)",
  "effectivePlanStatus": "ACTIVE",
  "entitlementStatus": "DEFAULT_BASIC_FREE",
  "effectiveSince": "2026-10-18T00:00:00Z",
  "effectiveUntil": null,
  "billingModel": "LIFETIME",
  "assetCount": 3,
  "assetLimit": 5,
  "storageBytes": 1542890,
  "storageBytesLimit": 104857600,
  "maxFileBytes": 10485760,
  "maxFileBytesLimit": 10485760,
  "hasVault": true,
  "vaultId": "d4c3b2a1-f6e5-0987-dcba-0987654321fe"
}
```

### 4.8. Tra cứu giao dịch thanh toán (Phụ thuộc PS-80)
- **URL**: `GET /api/v1/admin/subscriptions/transactions?query={query}`
- **Trạng thái thực tế**: PS-80 (Payment Gateway / Cổng thanh toán) đang trong quá trình phát triển độc lập và chưa cung cấp contract/nguồn dữ liệu giao dịch hoàn chỉnh.
- **Hành vi API**:
  - Trả về HTTP 409 với mã lỗi `PAYMENT_TRANSACTION_SOURCE_UNAVAILABLE`.
  - Không tạo dữ liệu giao dịch giả lập (không mock synthetic transaction).
  - Không trả về danh sách rỗng 200 `[]` để che giấu thiếu sót backend.
  - Frontend hiển thị panel cảnh báo trung thực cho Quản trị viên: "Nguồn dữ liệu giao dịch thanh toán phụ thuộc phân hệ PS-80 (chưa tích hợp). Chức năng tra cứu giao dịch hiện chưa khả dụng trên môi trường này."

---

## 5. Bảng Audit Logging (Hành động Quản trị)

| Action Code | Diễn giải | Metadata ghi nhận |
|---|---|---|
| `SUBSCRIPTION_PLAN_DRAFT_CREATED` | Tạo bản nháp phiên bản mới | `planCode`, `version`, `sourceVersionId`, `ipAddress` |
| `SUBSCRIPTION_PLAN_DRAFT_UPDATED` | Cập nhật cấu hình bản nháp | `planCode`, `version`, `purchasePriceVnd`, `assetLimit`, `storageBytesLimit`, `ipAddress` |
| `SUBSCRIPTION_PLAN_PUBLISHED` | Công bố phiên bản chính thức | `planCode`, `version`, `purchasePriceVnd`, `ipAddress` |
| `SUBSCRIPTION_PLAN_DEPRECATED` | Ngừng áp dụng phiên bản | `planCode`, `version`, `ipAddress` |
