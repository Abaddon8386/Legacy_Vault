# Gói sử dụng — PS-77

## Quyết định mới thay thế mô hình theo tháng

Gói được chọn **sau đăng ký**, dùng **trọn đời**, không gia hạn/hết hạn theo thời gian.
Theo câu trả lời mới nhất, **được nâng hạn mức**; không triển khai hạ gói.
Giá đã chốt: STANDARD 199.000 VND, EXTENDED 499.000 VND, BASIC miễn phí. Owner được tự nâng gói của chính mình. Evidence pháp lý dùng quota riêng cho từng ca.
Resolver khoảng thời gian thử nghiệm đã được bỏ. V21 thêm purchase_price_vnd và billing_model=LIFETIME, nâng catalog lên version 2; V20 và giá tháng lịch sử được giữ nguyên. API dùng priceVnd + billingModel thay monthlyPriceVnd.

Phạm vi: catalog, BASIC mặc định, chọn/nâng gói trọn đời, usage SQL Server thật, guard Owner content
và quota evidence theo ca. Contract cần PS-76 review trước khi nối FE. Không xử lý thanh toán trực tuyến;
chênh lệch giá trả về không phải bằng chứng đã thu tiền.

## Quy tắc đã xác nhận ngày 17/10/2026

- Đơn vị nhị phân: 1 MB = 1.048.576 byte; 1 GB = 1.073.741.824 byte. API trả số byte nguyên.
- BASIC: 5 tài sản, 104.857.600 byte, miễn phí.
- STANDARD: 50 tài sản, 1.073.741.824 byte, 199.000 VND một lần.
- EXTENDED: 200 tài sản, 5.368.709.120 byte, 499.000 VND một lần.
- Mỗi file tối đa 10.485.760 byte. Giới hạn servlet/WillFile vẫn được kiểm tra.
- Count mọi hàng Asset còn lưu, kể cả DOCUMENT và trạng thái khác ACTIVE. Không lấy count từ danh sách Asset vốn loại DOCUMENT.
- Storage gồm nội dung UTF-8 của payload và tổng kích thước mọi file version còn lưu, không chỉ phiên bản mới nhất.
- Không tính tag/IV mã hóa, metadata hoặc số Beneficiary vào quota này. Evidence của ca được tính riêng theo chính sách bên dưới.
- Mọi Owner hiện có/mới được BASIC mặc định, không tự tạo Vault. Default entitlement hiện là fallback trong service,
  còn gói đã chọn/nâng lưu snapshot giá, version và hạn mức trong owner_subscription_entitlements.

## GET /api/v1/subscription-plans

Quyền `ROLE_VAULT_OWNER`, Bearer authentication; trả danh sách ba gói theo giới hạn tài sản tăng dần.
Không có action cấp gói khi đọc catalog.

```json
[
  {
    "code": "BASIC", "version": 2, "priceVnd": 0, "billingModel": "LIFETIME",
    "limits": { "assetCount": 5, "storageBytes": 104857600, "fileBytes": 10485760 }
  },
  {
    "code": "STANDARD", "version": 2, "priceVnd": 199000, "billingModel": "LIFETIME",
    "limits": { "assetCount": 50, "storageBytes": 1073741824, "fileBytes": 10485760 }
  },
  {
    "code": "EXTENDED", "version": 2, "priceVnd": 499000, "billingModel": "LIFETIME",
    "limits": { "assetCount": 200, "storageBytes": 5368709120, "fileBytes": 10485760 }
  }
]
```

## GET /api/v1/subscriptions/me

Quyền `ROLE_VAULT_OWNER`. Owner lấy từ principal, không nhận Owner mục tiêu từ client.
Owner chưa có Vault trả 200 với usage 0. Query `ownerId` không đổi chủ quota.
`effectiveUntil` luôn null theo mô hình trọn đời; giữ field để tương thích response. Thời gian ISO-8601 UTC.

```json
{
  "effectivePlan": {
    "code": "BASIC", "version": 2, "priceVnd": 0, "billingModel": "LIFETIME",
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
Usage/gói được đọc trong transaction giữ khóa Owner, không dùng mock. Owner có thể nâng gói qua endpoint bên dưới.
PS-76 phải map shape này sau review; prototype hiện có không chứng minh contract đã được duyệt hay E2E.

## Guard trên các API ghi hiện có

- Tạo Asset: +1 count và byte payload UTF-8.
- Sửa payload: chênh lệch kích thước mới/cũ; đổi tên/mô tả không tăng quota.
- Upload Will: +1 count (DOCUMENT) và byte phiên bản đầu; thêm version: +0 count và toàn bộ byte version mới.
- Usage vượt quota từ dữ liệu có sẵn vẫn được giữ nguyên. Quota không chặn thao tác không tăng theo từng chiều;
  giảm byte không bù được việc tăng count vượt giới hạn. Các guard authorization/ownership/trạng thái vẫn áp dụng.
- Vượt count: 409 `ASSET_QUOTA_EXCEEDED`; vượt tổng storage: 409 `STORAGE_QUOTA_EXCEEDED`.
  File/body vượt giới hạn: 413 `PAYLOAD_TOO_LARGE`. ApiError và vi/en theo shared contract.
- Các writer khóa Owner rồi Vault và giữ tới commit; trạng thái Vault được refresh sau khóa để không
  dùng ACTIVE cũ vượt qua freeze/hold. Cập nhật payload refresh và khóa Asset trước khi tính delta.
  Không dùng bộ đếm usage tách rời.
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

## POST /api/v1/subscriptions/me/upgrade

Quyền `ROLE_VAULT_OWNER`; chỉ tác động Owner từ principal. Staff/Legal không được nâng hộ.
Có thể chọn gói trước khi tạo Vault. Request chỉ gửi mã gói và version catalog:

```json
{ "planCode": "STANDARD", "catalogVersion": 2 }
```

Trả 200 `{ "subscription": <CurrentSubscription>, "priceDifferenceVnd": 199000, "changed": true }`.
STANDARD lên EXTENDED trả chênh lệch 300000 VND. Chọn lại đúng gói hiện tại trả `changed=false`,
chênh lệch 0 và không tạo audit lặp. BASIC mặc định không cần hàng entitlement riêng.
Giá/hạn mức từ server; không tin giá hoặc Owner ID do client gửi. API phục vụ cấp hạn mức trong phạm vi
Sprint 2, không thu tiền và không ghi nhận giao dịch đã thanh toán.

Gói hiệu lực ngay và trọn đời, không scheduler gia hạn/hết hạn. Mọi chiều hạn mức không được giảm.
409 `SUBSCRIPTION_DOWNGRADE_NOT_ALLOWED` khi hạ gói; 409 `SUBSCRIPTION_CATALOG_STALE` khi version
không còn hiện hành (FE tải lại catalog); request thiếu/sai mã hoặc version không hợp lệ trả 400.
Nâng gói và ghi audit `SUBSCRIPTION_UPGRADED` cùng transaction dưới khóa Owner, audit lỗi rollback toàn bộ.
Các nâng đồng thời và ghi content dùng cùng khóa, không mất cập nhật hoặc sử dụng quota cũ sau commit.
Snapshot hạn mức bảo toàn quyền đã chọn khi catalog tương lai thay đổi.

## Evidence pháp lý theo ca

Chính sách được chọn theo ủy quyền của Owner: mỗi verification case tối đa **100 MiB**, **50 phiên bản
còn lưu**, **10 MiB/tệp**. Áp dụng file căn cứ pháp lý ở intake PS-41, gồm mọi version của dossier trong ca.
Không tính vào quota Owner; metadata/biên nhận không chứa file ở các API khác không tiêu dung lượng file.
Không xóa lịch sử khi đầy; chặn append bằng 409 `CASE_EVIDENCE_QUOTA_EXCEEDED`; vượt cỡ tệp trả 413.

Authorization, OPEN case, đúng người nhận ca, route, Vault và hold guards vẫn chạy trước kiểm tra quota.
Writer giữ khóa Vault → Case → Dossier tới commit nên các intake đồng thời không vượt giới hạn.
Usage lấy tổng file_size_bytes thật trong transaction; audit thất bại rollback cả version và usage.
Cấu hình deployment: `CASE_EVIDENCE_MAX_BYTES` (mặc định 104857600) và `CASE_EVIDENCE_MAX_VERSIONS`
(mặc định 50), `CASE_EVIDENCE_MAX_FILE_BYTES` (mặc định 10485760), phải dương; cỡ tệp không vượt tổng quota. Hạ cấu hình không xóa nội dung đã lưu, chỉ chặn append vượt mức.

## Kiểm thử SQL Server tùy chọn

PS-77 dùng `V19__preserve_lifetime_vault_ownership.sql` và
`V20__subscription_catalog_and_payload_usage.sql`. V12/V13 dành cho PS-44/45, V14/V15 thuộc
PS-41–43; remote còn có V16/V17 cho các nhánh legal/court/hold. V18 hiện thuộc nhánh PS-37 revalidation. V21 chuyển catalog sang giá trọn đời; V22 lưu snapshot entitlement. Hai script gốc chỉ đổi tên, giữ nguyên checksum.
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
