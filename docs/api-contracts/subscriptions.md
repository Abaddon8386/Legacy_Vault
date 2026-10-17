# Gói sử dụng — PS-77

Phạm vi hiện có: catalog, gói Cơ bản mặc định, usage SQL Server thật và guard Owner content.
Contract API mới cần PS-76 review trước khi nối FE. Chưa có API cấp gói, kỳ hạn paid,
payment hoặc policy quota cho evidence pháp lý; không coi toàn bộ PS-77 đã hoàn tất.

## Quy tắc đã xác nhận ngày 17/10/2026

- Đơn vị nhị phân: 1 MB = 1.048.576 byte; 1 GB = 1.073.741.824 byte. API trả số byte nguyên.
- BASIC: 5 tài sản, 104.857.600 byte, miễn phí.
- STANDARD: 50 tài sản, 1.073.741.824 byte, 29.000 VND/tháng (catalog, chưa cấp được).
- EXTENDED: 200 tài sản, 5.368.709.120 byte, 59.000 VND/tháng (catalog, chưa cấp được).
- Mỗi file tối đa 10.485.760 byte. Giới hạn servlet/WillFile vẫn được kiểm tra.
- Count mọi hàng Asset còn lưu, kể cả DOCUMENT và trạng thái khác ACTIVE. Không lấy count từ danh sách Asset vốn loại DOCUMENT.
- Storage gồm nội dung UTF-8 của payload và tổng kích thước mọi file version còn lưu, không chỉ phiên bản mới nhất.
- Không tính tag/IV mã hóa, metadata hoặc số Beneficiary vào quota này. Chưa đưa evidence case vào storage Owner.
- Mọi Owner hiện có/mới được BASIC mặc định, không tự tạo Vault. Default entitlement hiện là fallback trong service,
  không phải một grant paid được lưu hoặc một kỳ hạn được suy diễn. Các bảng/command paid sẽ được bổ sung sau quyết định nghiệp vụ.

## GET /api/v1/subscription-plans

Quyền `ROLE_VAULT_OWNER`, Bearer authentication; trả danh sách ba gói theo giới hạn tài sản tăng dần.
Không có action cấp gói khi đọc catalog.

```json
[
  {
    "code": "BASIC", "version": 1, "monthlyPriceVnd": 0,
    "limits": { "assetCount": 5, "storageBytes": 104857600, "fileBytes": 10485760 }
  },
  {
    "code": "STANDARD", "version": 1, "monthlyPriceVnd": 29000,
    "limits": { "assetCount": 50, "storageBytes": 1073741824, "fileBytes": 10485760 }
  },
  {
    "code": "EXTENDED", "version": 1, "monthlyPriceVnd": 59000,
    "limits": { "assetCount": 200, "storageBytes": 5368709120, "fileBytes": 10485760 }
  }
]
```

## GET /api/v1/subscriptions/me

Quyền `ROLE_VAULT_OWNER`. Owner lấy từ principal, không nhận Owner mục tiêu từ client.
Owner chưa có Vault trả 200 với usage 0. Query `ownerId` không đổi chủ quota.
`effectiveUntil` nullable; BASIC hiện không hết hạn. Thời gian ISO-8601 UTC.

```json
{
  "effectivePlan": {
    "code": "BASIC", "version": 1, "monthlyPriceVnd": 0,
    "limits": { "assetCount": 5, "storageBytes": 104857600, "fileBytes": 10485760 }
  },
  "effectiveUntil": null,
  "usage": { "assetCount": 0, "storageBytes": 0 },
  "overQuota": { "assets": false, "storage": false },
  "vaultCreated": false,
  "evaluatedAt": "2026-10-17T07:00:00Z"
}
```

401 cho principal không hợp lệ/tài khoản không ACTIVE hoặc đã soft-delete; 403 nếu thiếu role.
Usage/gói được đọc trong transaction giữ khóa Owner, không dùng mock. Không có API đổi/cấp gói.
PS-76 phải map shape này sau review; prototype hiện có không chứng minh contract đã được duyệt hay E2E.

## Guard trên các API ghi hiện có

- Tạo Asset: +1 count và byte payload UTF-8.
- Sửa payload: chênh lệch kích thước mới/cũ; đổi tên/mô tả không tăng quota.
- Upload Will: +1 count (DOCUMENT) và byte phiên bản đầu; thêm version: +0 count và toàn bộ byte version mới.
- Usage vượt quota từ dữ liệu có sẵn vẫn được giữ nguyên. Quota không chặn thao tác không tăng theo từng chiều;
  giảm byte không bù được việc tăng count vượt giới hạn. Các guard authorization/ownership/trạng thái vẫn áp dụng.
- Vượt count: 409 `ASSET_QUOTA_EXCEEDED`; vượt tổng storage: 409 `STORAGE_QUOTA_EXCEEDED`.
  File/body vượt giới hạn: 413 `PAYLOAD_TOO_LARGE`. ApiError và vi/en theo shared contract.
- Các writer khóa tài khoản Owner trước resource lock và giữ tới commit. Không dùng bộ đếm usage tách rời.
  Asset/version/audit thất bại rollback cùng transaction; không có bản ghi upload nửa chừng.

SQL computed `assets.payload_size_bytes` dựa trên envelope hiện hành AES/GCM/NoPadding, tag 128 bit, IV tách riêng:
`DATALENGTH(encrypted_payload) - 16`, null payload = 0. Không giải mã hoặc ghi lại dữ liệu cũ. Migration từ chối
ciphertext ngắn hơn tag. Thay envelope trong tương lai phải cập nhật cả computed-size contract và test.

## Một kho suốt đời

`UQ_vaults_owner` không lọc status. DB giữ hàng Vault, chặn physical DELETE và thay Owner;
không có API xóa/đóng/archive mới được tạo bởi PS-77. Các trạng thái giữ hàng không cấp lại quyền tạo.
Hai POST tạo kho đồng thời được serialize trên hàng User hiện có: một 201, một 409 `VAULT_ALREADY_EXISTS`.
Tạo và audit cùng transaction: thất bại không tiêu hao quyền tạo kho. Runtime DB không được có quyền
ALTER/CONTROL để tắt/drop trigger hoặc bỏ constraint; migration principal là quyền triển khai riêng.

## Giới hạn tích hợp

Chưa chốt authority cấp gói, kỳ hạn paid và tiếp nhận evidence khi hết quota. Vì vậy:
không seed quyền Admin, không expose paid grant, không triển khai renewal/scheduler theo lịch tháng,
không sửa quota intake PS-38/39/41/42 hoặc route/hold/unlock/handover PS-46–48.
Catalog trả giá paid để so sánh, không xác nhận Owner đang hưởng paid plan.

## Kiểm thử SQL Server tùy chọn

PS-77 dùng `V18__preserve_lifetime_vault_ownership.sql` và
`V19__subscription_catalog_and_payload_usage.sql`. V12/V13 dành cho PS-44/45, V14/V15 thuộc
PS-41–43; remote còn có V16/V17 cho các nhánh legal/court/hold. Nội dung SQL của PS-77 được giữ nguyên.
Môi trường từng áp dụng migration PS-77 với số cũ cần đánh giá lịch sử triển khai riêng;
không tự reset DB, chạy repair hoặc sửa `flyway_schema_history`.

`SubscriptionSqlServerTest` chỉ bật khi `PS77_SQLSERVER_TEST_DATABASE` khớp toàn bộ
`LegacyVault_PS77_[A-Za-z0-9_]+`. Phải tạo trước DB dùng một lần, dùng Windows integrated authentication
và JDBC auth DLL phù hợp; không dùng `LegacyVault` hoặc DB có dữ liệu cần giữ. Test chạy Flyway thật và ghi
fixture vào DB đó. `PS77_SQLSERVER_TEST_SERVER` tùy chọn theo dạng `host:port`; không nhận JDBC URL tự do.

Sau khi chuẩn bị biến môi trường và DB dùng một lần, chạy:

```powershell
mvn.cmd -q -f backend/pom.xml '-Dtest=SubscriptionSqlServerTest' test
```

Test bao gồm API/auth/catalog, UTF-8/all versions, count/storage boundaries và concurrency,
rollback audit, lifetime DELETE/Owner guard và preflight duplicate. Test đổi recorded-size metadata
để mô phỏng biên 100 MB mà không tạo 100 MB file; nó không chứng minh tính toàn vẹn nội dung của fixture đó.
Đóng app và xóa riêng DB dùng một lần sau kiểm thử. Không lưu kết quả DB thật hoặc cấu hình máy vào PR.
