# LegacyVault — Data Dictionary

**PS-73 --- UUID Schema v3, cập nhật bổ sung thuộc tính `trustees.note`**

Phạm vi: 14 bảng nền tảng/ứng dụng; Microsoft SQL Server; kiểu dữ liệu
T-SQL.

Lưu ý: Tài liệu mô tả schema dự kiến sau khi
`V1__create_initial_schema_PS73_batchfix.sql` và
`V2__upgrade_schema_to_latest_dictionary.sql` chạy thành công. Cần đối
chiếu database thực tế trước khi xem đây là schema đã triển khai. V2 giữ
khóa nội bộ `BIGINT`, bổ sung `public_id` cho 10 bảng tài nguyên với
`DEFAULT NEWID()` để hỗ trợ seed/SQL INSERT không chỉ định UUID, thêm
`users.deleted_at`, `beneficiaries.date_of_birth`,
`beneficiaries.relationship_to_owner` và
`legal_documents.current_verification_id`. SHA-256 chỉ phục vụ kiểm tra
toàn vẹn, không chứng minh giá trị pháp lý của tài liệu.

# 1. Danh sách bảng

| Bảng | Mục đích |
| --- | --- |
| users | Tài khoản người dùng, trạng thái và xóa mềm |
| roles | Danh mục vai trò RBAC |
| user_roles | Gán vai trò cho tài khoản |
| vaults | Kho di sản số thuộc Owner |
| assets | Tài sản logic thuộc Vault |
| asset_versions | Phiên bản file/tài liệu, SHA-256 và metadata |
| trustees | Người thi hành/Trustee được chỉ định cho Vault |
| beneficiaries | Người thụ hưởng, ngày sinh và quan hệ với Owner |
| asset_allocations | Phân bổ tài sản cho người thụ hưởng |
| dms_configs | Một cấu hình Dead Man's Switch cho mỗi tài khoản Owner |
| vitality_check_logs | Lịch sử sự kiện check-in/DMS |
| audit_logs | Nhật ký kiểm toán append-only |
| legal_documents | Hồ sơ nghiệp vụ của tài liệu pháp lý |
| legal_verifications | Lịch sử các lần xác minh và quyết định pháp lý |

# 2. Chi tiết thuộc tính

## users — Tài khoản

| Thuộc tính | Kiểu dữ liệu | Khóa / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- |
| user_id | BIGINT IDENTITY(1,1) | PK | Mã tài khoản nội bộ |
| public_id | UNIQUEIDENTIFIER | UNIQUE, NOT NULL, DEFAULT NEWID(); thêm ở V2 | ID công khai dùng trong API |
| full_name | NVARCHAR(150) | NOT NULL | Họ tên |
| email | NVARCHAR(254) | UNIQUE, NOT NULL | Email đăng nhập |
| phone_number | NVARCHAR(20) | NULL | Số điện thoại |
| password_hash | NVARCHAR(255) | NOT NULL | BCrypt hash; không lưu mật khẩu gốc |
| status | NVARCHAR(20) | DEFAULT PENDING | Trạng thái tài khoản |
| email_verified_at | DATETIME2 | NULL | Thời điểm xác minh email |
| created_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm tạo |
| updated_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm cập nhật; ứng dụng phải cập nhật khi sửa |
| deleted_at | DATETIME2 | NULL; thêm ở V2 | Thời điểm xóa mềm; NULL nghĩa là chưa xóa mềm |

Quy tắc đăng nhập: chỉ cho phép tài khoản có trạng thái hợp lệ (theo
contract hiện tại là `ACTIVE`) và `deleted_at IS NULL`; đồng thời phải
xác minh thông tin đăng nhập. Không lưu JWT vào bảng này.

## roles — Vai trò

| Thuộc tính | Kiểu dữ liệu | Khóa / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- |
| role_id | BIGINT IDENTITY(1,1) | PK | Mã vai trò |
| role_code | NVARCHAR(50) | UNIQUE, NOT NULL | Mã vai trò dùng cho authorization |
| role_name | NVARCHAR(100) | NOT NULL | Tên hiển thị |
| description | NVARCHAR(255) | NULL | Mô tả |

Các role code đã thống nhất: `ROLE_VAULT_OWNER`, `ROLE_STAFF_EXECUTOR`,
`ROLE_LEGAL_VERIFIER`, `ROLE_ADMIN`, `ROLE_BENEFICIARY`. Khi đăng ký,
server tự gán `ROLE_VAULT_OWNER`; client không được tự gửi role.

## user_roles — Gán vai trò

| Thuộc tính | Kiểu dữ liệu | Khóa / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- |
| user_id | BIGINT | PK ghép, FK users | Tài khoản |
| role_id | BIGINT | PK ghép, FK roles | Vai trò |
| assigned_by_user_id | BIGINT | FK users, NULL | Tài khoản thực hiện gán |
| assigned_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm gán |

PK ghép: (`user_id`, `role_id`).

## vaults — Vault

| Thuộc tính | Kiểu dữ liệu | Khóa / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- |
| vault_id | BIGINT IDENTITY(1,1) | PK | Mã Vault nội bộ |
| public_id | UNIQUEIDENTIFIER | UNIQUE, NOT NULL, DEFAULT NEWID(); thêm ở V2 | ID công khai |
| owner_user_id | BIGINT | FK users, UNIQUE, NOT NULL | Mỗi Owner chỉ được tạo duy nhất một Vault; tạo Vault thứ hai trả 409 Conflict ở API |
| vault_name | NVARCHAR(150) | NOT NULL | Tên Vault |
| description | NVARCHAR(MAX) | NULL | Mô tả |
| status | NVARCHAR(40) | DEFAULT ACTIVE | Trạng thái Vault |
| created_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm tạo |
| updated_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm cập nhật |

Owner phải được lấy từ Security Context, không tin `owner_user_id` do
client gửi lên.

## assets — Tài sản logic

| Thuộc tính | Kiểu dữ liệu | Khóa / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- |
| asset_id | BIGINT IDENTITY(1,1) | PK | Mã tài sản nội bộ |
| public_id | UNIQUEIDENTIFIER | UNIQUE, NOT NULL, DEFAULT NEWID(); thêm ở V2 | ID công khai |
| vault_id | BIGINT | FK vaults, NOT NULL | Vault sở hữu tài sản |
| asset_type | NVARCHAR(40) | NOT NULL | Loại tài sản |
| title | NVARCHAR(200) | NOT NULL | Tên hiển thị |
| description | NVARCHAR(MAX) | NULL | Mô tả |
| encrypted_payload | VARBINARY(MAX) | NULL | Payload mã hóa nếu lưu trực tiếp ở Asset |
| encryption_iv | BINARY(12) | NULL | IV tương ứng |
| encryption_key_version | NVARCHAR(50) | NULL | Phiên bản khóa; không lưu khóa bí mật |
| status | NVARCHAR(20) | DEFAULT ACTIVE | Trạng thái |
| created_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm tạo |
| updated_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm cập nhật |

Các trường payload/IV/key version phải tuân theo CHECK constraint trong
V1. Tạo Asset không đồng nghĩa với bàn giao hoặc giải mã.

## asset_versions — Phiên bản tài liệu

| Thuộc tính | Kiểu dữ liệu | Khóa / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- |
| asset_version_id | BIGINT IDENTITY(1,1) | PK | Mã phiên bản nội bộ |
| public_id | UNIQUEIDENTIFIER | UNIQUE, NOT NULL, DEFAULT NEWID(); thêm ở V2 | ID công khai |
| asset_id | BIGINT | FK assets, NOT NULL | Tài sản logic tương ứng |
| version_no | INT | CHECK \>= 1; duy nhất theo cặp (asset_id, version_no) | Số phiên bản |
| original_file_name | NVARCHAR(255) | NOT NULL | Tên file gốc; không dùng làm đường dẫn lưu trữ |
| content_type | NVARCHAR(150) | NOT NULL | MIME type |
| file_size_bytes | BIGINT | CHECK \> 0 | Kích thước file |
| sha256_hash | CHAR(64) | NOT NULL | SHA-256 theo quy ước thống nhất |
| encrypted_file_content | VARBINARY(MAX) | NOT NULL | Nội dung file đã mã hóa |
| encryption_iv | BINARY(12) | NOT NULL | IV của file |
| encryption_key_version | NVARCHAR(50) | NOT NULL | Phiên bản khóa |
| upload_status | NVARCHAR(20) | DEFAULT UPLOADED | UPLOADED không đồng nghĩa LEGAL_APPROVED |
| uploaded_by_user_id | BIGINT | FK users, NOT NULL | Tài khoản tải lên |
| uploaded_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm upload |

Hash chỉ kiểm tra thay đổi theo quy ước đã chọn, không chứng minh giá
trị pháp lý.

## trustees — Trustee

Cập nhật: thêm `note NVARCHAR(255) NULL` để Owner lưu ghi chú/hướng dẫn cho Trustee.

| Thuộc tính | Kiểu dữ liệu | Khóa / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- |
| trustee_id | BIGINT IDENTITY(1,1) | PK | Mã Trustee nội bộ |
| public_id | UNIQUEIDENTIFIER | UNIQUE, NOT NULL, DEFAULT NEWID(); thêm ở V2 | ID công khai |
| vault_id | BIGINT | FK vaults, NOT NULL; filtered unique index cho status = APPOINTED | Cho phép giữ lịch sử Trustee đã thu hồi; tối đa một Trustee đang được chỉ định mỗi Vault |
| full_name | NVARCHAR(150) | NOT NULL | Họ tên |
| phone_number | NVARCHAR(20) | NULL; CHECK phone_number IS NOT NULL OR email IS NOT NULL | Số điện thoại; có thể để trống nếu có email |
| email | NVARCHAR(254) | NULL; CHECK phone_number IS NOT NULL OR email IS NOT NULL | Email; có thể để trống nếu có số điện thoại |
| relationship_to_owner | NVARCHAR(100) | NULL | Quan hệ với Owner |
| note | NVARCHAR(255) | NULL | Ghi chú/hướng dẫn do Vault Owner để lại cho Trustee |
| status | NVARCHAR(20) | DEFAULT APPOINTED | Trạng thái chỉ định |
| appointed_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm chỉ định |
| revoked_at | DATETIME2 | NULL | Thời điểm thu hồi |

Trustee không bắt buộc có tài khoản User và không mặc định là
Beneficiary.

## beneficiaries — Người thụ hưởng

| Thuộc tính | Kiểu dữ liệu | Khóa / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- |
| beneficiary_id | BIGINT IDENTITY(1,1) | PK | Mã người thụ hưởng nội bộ |
| public_id | UNIQUEIDENTIFIER | UNIQUE, NOT NULL, DEFAULT NEWID(); thêm ở V2 | ID công khai |
| vault_id | BIGINT | FK vaults, NOT NULL | Vault chỉ định người này |
| linked_user_id | BIGINT | FK users, NULL | Tài khoản liên kết nếu đã có; không bắt buộc |
| full_name | NVARCHAR(150) | NOT NULL | Họ tên |
| date_of_birth | DATE | NULL; thêm ở V2 | Ngày sinh; dùng xác định người chưa thành niên |
| relationship_to_owner | NVARCHAR(100) | NULL; thêm ở V2 | Quan hệ với Vault Owner |
| email | NVARCHAR(254) | NULL | Email liên hệ |
| phone_number | NVARCHAR(20) | NULL | Số điện thoại |
| identity_document_type | NVARCHAR(30) | NULL | Loại giấy tờ định danh |
| identity_document_no_encrypted | VARBINARY(512) | NULL | Số giấy tờ đã mã hóa |
| designation_status | NVARCHAR(20) | DEFAULT DESIGNATED | Trạng thái chỉ định |
| id_verification_status | NVARCHAR(30) | DEFAULT NOT_VERIFIED | Trạng thái xác minh danh tính |
| account_status | NVARCHAR(30) | DEFAULT NOT_CREATED | Trạng thái tài khoản |
| created_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm tạo |

Hai trường mới cho phép NULL để tương thích dữ liệu cũ. Nếu nghiệp vụ
yêu cầu bắt buộc, kiểm tra tại DTO/Service. Luồng người dưới 18 tuổi cần
xử lý thông tin người giám hộ; schema hiện tại chưa có thuộc tính riêng
cho người giám hộ.

## asset_allocations — Phân bổ tài sản

| Thuộc tính | Kiểu dữ liệu | Khóa / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- |
| allocation_id | BIGINT IDENTITY(1,1) | PK | Mã phân bổ |
| public_id | UNIQUEIDENTIFIER | UNIQUE, NOT NULL, DEFAULT NEWID(); thêm ở V2 | ID công khai |
| asset_id | BIGINT | FK assets, NOT NULL | Tài sản được phân bổ |
| beneficiary_id | BIGINT | FK beneficiaries, NOT NULL | Người thụ hưởng |
| allocation_description | NVARCHAR(MAX) | NULL | Hướng dẫn/phạm vi phân bổ |
| version_no | INT | DEFAULT 1, CHECK \>= 1 | Phiên bản bản ghi phân bổ |
| status | NVARCHAR(20) | DEFAULT DRAFT | Trạng thái |
| created_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm tạo |

Service phải xác minh Asset và Beneficiary thuộc cùng Vault; các FK
riêng lẻ không bảo đảm điều kiện này.

## dms_configs — Dead Man's Switch

| Thuộc tính | Kiểu dữ liệu | Khóa / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- |
| dms_id | BIGINT IDENTITY(1,1) | PK | Mã cấu hình DMS |
| public_id | UNIQUEIDENTIFIER | UNIQUE, NOT NULL, DEFAULT NEWID(); thêm ở V2 | ID công khai |
| owner_user_id | BIGINT | FK users, UNIQUE, NOT NULL | Một DMS cho mỗi tài khoản Owner |
| check_interval_days | SMALLINT | CHECK \> 0 | Khoảng cách check-in |
| grace_period_days | SMALLINT | NOT NULL, DEFAULT 1, CHECK >= 0 | Số ngày ân hạn; mặc định 1 ngày, Owner có thể chỉnh sửa |
| status | NVARCHAR(30) | DEFAULT MONITORING | Trạng thái DMS |
| last_check_in_at | DATETIME2 | NULL | Check-in gần nhất |
| next_check_at | DATETIME2 | NULL | Hạn check-in tiếp theo |
| triggered_at | DATETIME2 | NULL | Thời điểm chuyển TRIGGERED |
| grace_period_ends_at | DATETIME2 | NULL | Hạn kết thúc grace period |
| updated_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm cập nhật |

Scheduler chỉ chuyển trạng thái theo luồng DMS và ghi hạn grace period;
không tự xác nhận tử vong, mở khóa hoặc giải mã tài sản.

## vitality_check_logs — Lịch sử DMS

| Thuộc tính | Kiểu dữ liệu | Khóa / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- |
| check_log_id | BIGINT IDENTITY(1,1) | PK | Mã sự kiện |
| dms_id | BIGINT | FK dms_configs, NOT NULL | DMS liên quan |
| event_type | NVARCHAR(30) | NOT NULL | Loại sự kiện, ví dụ CHECK_IN_RECEIVED hoặc DMS_TRIGGERED |
| event_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm sự kiện |
| channel | NVARCHAR(30) | NULL | Kênh liên lạc |
| details | NVARCHAR(MAX) | NULL | Thông tin bổ sung; không ghi bí mật dạng rõ |

## audit_logs — Audit log

| Thuộc tính | Kiểu dữ liệu | Khóa / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- |
| audit_log_id | BIGINT IDENTITY(1,1) | PK | Mã sự kiện audit |
| actor_user_id | BIGINT | FK users, NULL | NULL với sự kiện hệ thống |
| vault_id | BIGINT | FK vaults, NULL | Vault liên quan |
| action | NVARCHAR(100) | NOT NULL | Hành động |
| entity_type | NVARCHAR(50) | NOT NULL | Loại entity chịu tác động |
| entity_id | BIGINT | NULL | Mã nội bộ entity chịu tác động |
| occurred_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm |
| ip_address | VARCHAR(45) | NULL | IPv4/IPv6 |
| details | NVARCHAR(MAX) | NULL; JSON hợp lệ nếu có | Metadata; không log nội dung di chúc, mật khẩu, token hoặc khóa |
| retention_until | DATETIME2 | NULL | Mốc lưu giữ theo chính sách |

V1 có trigger chặn UPDATE/DELETE. Cần giới hạn quyền DB runtime và kiểm
thử trigger trên SQL Server; không dùng tài khoản `db_owner` cho ứng
dụng.

## legal_documents — Hồ sơ tài liệu pháp lý

| Thuộc tính | Kiểu dữ liệu | Khóa / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- |
| legal_document_id | BIGINT IDENTITY(1,1) | PK | Mã hồ sơ pháp lý |
| public_id | UNIQUEIDENTIFIER | UNIQUE, NOT NULL, DEFAULT NEWID(); thêm ở V2 | ID công khai |
| asset_id | BIGINT | FK assets, UNIQUE, NOT NULL | Mỗi Asset tối đa một LegalDocument theo thiết kế hiện tại |
| document_type | NVARCHAR(40) | NOT NULL | Loại tài liệu, ví dụ WILL hoặc DEATH_CERTIFICATE |
| verification_status | NVARCHAR(30) | DEFAULT PENDING_VERIFICATION; CHECK | Trạng thái quy trình xác minh |
| submitted_at | DATETIME2 | NULL | Thời điểm gửi xác minh |
| current_verification_id | BIGINT | FK legal_verifications, NULL; thêm ở V2 | Lần xác minh hiện tại nếu có |
| created_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm tạo |
| updated_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm cập nhật; Service phải cập nhật khi sửa |

Upload tài liệu không tự đặt `LEGAL_APPROVED`. `current_verification_id`
tham chiếu lần xác minh hiện tại; Service phải cập nhật nhất quán trong
transaction.

## legal_verifications — Lịch sử xác minh pháp lý

| Thuộc tính | Kiểu dữ liệu | Khóa / ràng buộc | Ý nghĩa |
| --- | --- | --- | --- |
| verification_id | BIGINT IDENTITY(1,1) | PK | Mã lần xác minh |
| public_id | UNIQUEIDENTIFIER | UNIQUE, NOT NULL, DEFAULT NEWID(); thêm ở V2 | ID công khai |
| legal_document_id | BIGINT | FK legal_documents, NOT NULL | Hồ sơ được xác minh |
| asset_version_id | BIGINT | FK asset_versions, NULL | Phiên bản file được xem xét nếu có; được giữ từ V1 |
| verifier_user_id | BIGINT | FK users, NULL | Người xác minh; có thể chưa được gán |
| result | NVARCHAR(30) | DEFAULT PENDING; CHECK | Kết quả lần xử lý |
| remarks | NVARCHAR(1000) | NULL | Ghi chú quyết định; không chứa bí mật |
| requested_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm yêu cầu |
| decided_at | DATETIME2 | NULL | Thời điểm quyết định |
| created_at | DATETIME2 | DEFAULT SYSUTCDATETIME() | Thời điểm tạo bản ghi |

Các lần xác minh là lịch sử; không ghi đè hoặc xóa quyết định cũ khi xác
minh lại. `asset_version_id` được giữ để tương thích schema V1.

# 3. Quy tắc nghiệp vụ liên quan đến PS-9 đến PS-23

-   **Authentication:** chỉ cho đăng nhập khi trạng thái tài khoản hợp
    lệ và `deleted_at IS NULL`; không log password hoặc JWT.
-   **RBAC:** server tự gán `ROLE_VAULT_OWNER` khi đăng ký; Spring
    Security kiểm tra quyền cho endpoint.
-   **Vault/Asset ownership:** mỗi Owner chỉ có duy nhất một Vault; API
    trả `409 Conflict` khi tạo Vault thứ hai. Lấy Owner từ Security Context;
    kiểm tra quyền sở hữu trước khi xem, tạo hoặc cập nhật dữ liệu.
-   **Upload và versioning:** upload thành công không đồng nghĩa phê
    duyệt pháp lý; hash SHA-256 không chứng minh giá trị pháp lý.
-   **Trustee:** không bắt buộc có User account và không mặc định là
    Beneficiary. Lưu lịch sử bằng bản ghi riêng; chỉ một bản ghi `APPOINTED`
    cho mỗi Vault. Ít nhất một trong `phone_number` hoặc `email` phải có giá trị.
-   **Beneficiary:** độc lập với User account; kiểm tra điều kiện ít
    nhất một Beneficiary trong Service/transaction khi hoàn tất cấu
    hình. Người dưới 18 tuổi cần luồng thông tin người giám hộ.
-   **Asset allocation:** Service phải kiểm tra Asset và Beneficiary
    thuộc cùng Vault.
-   **DMS:** một cấu hình cho mỗi tài khoản Owner. `grace_period_days`
    mặc định là 1 ngày và Owner có thể chỉnh sửa. Scheduler chuyển quá hạn
    sang `TRIGGERED` và ghi grace period; không tự chuyển
    `DEATH_CONFIRMED`/`UNLOCKED`, không giải mã.
-   **Legal verification:** lưu lịch sử từng lần xác minh; kiểm tra
    quyền verifier và ghi audit.
-   **Audit:** không ghi mật khẩu, token, khóa mã hóa hay nội dung tài
    liệu. Append-only cần cả trigger và quyền DB tối thiểu.
-   **UUID:** API dùng `public_id` làm định danh công khai; không trả
    `BIGINT` nội bộ nếu contract yêu cầu UUID.
-   **updated_at:** DEFAULT chỉ áp dụng lúc INSERT; Service phải cập
    nhật khi UPDATE.

# 4. Quan hệ chính

| Entity A | Entity B | Bội số | Triển khai |
| --- | --- | --- | --- |
| users | roles | N:M | Qua user_roles |
| users | vaults | 1 : 0..1 | vaults.owner_user_id UNIQUE; API trả 409 nếu tạo Vault thứ hai |
| vaults | assets | 1:N | assets.vault_id |
| assets | asset_versions | 1:N | asset_versions.asset_id |
| users | asset_versions | 1:N | uploaded_by_user_id |
| vaults | trustees | 1 : 0..1 đang hiệu lực, 1:N lịch sử | Filtered unique index UX_trustees_vault_active trên vault_id khi status = APPOINTED |
| vaults | beneficiaries | 1:N | beneficiaries.vault_id |
| users | beneficiaries | 1:N tùy chọn | beneficiaries.linked_user_id |
| assets | beneficiaries | N:M | Qua asset_allocations; Service kiểm tra cùng Vault |
| users | dms_configs | 1 : 0..1 | dms_configs.owner_user_id UNIQUE |
| dms_configs | vitality_check_logs | 1:N | vitality_check_logs.dms_id |
| users | audit_logs | 1:0..N | actor_user_id nullable |
| vaults | audit_logs | 1:0..N | vault_id nullable |
| assets | legal_documents | 1 : 0..1 | legal_documents.asset_id UNIQUE |
| legal_documents | legal_verifications | 1:N | legal_verifications.legal_document_id |
| asset_versions | legal_verifications | 1:0..N | asset_version_id nullable |
| users | legal_verifications | 1:0..N | verifier_user_id nullable |

# 5. Role codes và seed

Các role code thống nhất: `ROLE_VAULT_OWNER`, `ROLE_STAFF_EXECUTOR`,
`ROLE_LEGAL_VERIFIER`, `ROLE_ADMIN`, `ROLE_BENEFICIARY`. Seed role nên
dùng cách tránh chèn trùng. Migration CREATE TABLE không phải script có
thể chạy lại tùy ý trên schema đã tồn tại.

# 6. Lưu ý khi triển khai

-   Không đưa mật khẩu thật, JWT secret, khóa mã hóa hoặc dữ liệu định
    danh rõ vào repository/log.
-   Không thêm `share_ratio` vào `asset_allocations` nếu nghiệp vụ không
    yêu cầu.
-   `beneficiaries.date_of_birth` và `relationship_to_owner` hiện
    nullable để tương thích dữ liệu cũ; có thể bắt buộc ở DTO/Service
    theo nghiệp vụ.
-   V2 backfill UUID cũ bằng `NEWID()` và đặt `DEFAULT NEWID()` trên
    cả 10 cột `public_id`; ứng dụng vẫn có thể tự gán UUID cho bản ghi mới.
-   Không sửa migration đã chạy thành công trên database dùng chung; nếu
    cần thay đổi tiếp theo, tạo migration phiên bản mới.
-   Đối chiếu tên cột, kiểu dữ liệu, index, FK và CHECK constraint trong
    tài liệu với migration đã merge và database thực tế.
-   Chạy focused tests, Maven checks và kiểm thử migration/trigger trên
    SQL Server thực tế trước khi merge.
-   Các bảng `legal_documents` và `legal_verifications` quản lý
    metadata/quy trình pháp lý; không thay thế tư vấn pháp lý hoặc xác
    nhận giá trị pháp lý của tài liệu.
