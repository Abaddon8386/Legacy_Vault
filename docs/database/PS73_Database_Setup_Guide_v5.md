
# LEGACYVAULT — PS-73 DATABASE SETUP GUIDE

**Phiên bản:** v6 (classpath migration, UUID defaults và quy tắc nghiệp vụ đã cập nhật)
**Phạm vi:** Bắt đầu từ chuẩn bị SQL Server/database, cài đặt Flyway, chạy migration, seed dữ liệu và kiểm tra hoàn tất.

> **Mục tiêu:** Hướng dẫn thành viên chuẩn bị SQL Server database tên `LegacyVault`, cấu hình Backend Spring Boot, thêm Flyway vào Maven, chạy migration, nạp dữ liệu thử nghiệm và kiểm tra kết quả.
>
> **Lưu ý:** Database dùng chung tên `LegacyVault`, nhưng `Server name`/`instance name` có thể khác trên từng máy. Không sao chép nguyên server name của thành viên khác; hãy dùng tên instance mà SSMS trên chính máy bạn kết nối được.

## 1. Chuẩn bị SQL Server và database

### 1.1. Kết nối SQL Server bằng SSMS

1. Mở SQL Server Management Studio (SSMS).
2. Chọn **Connect → Database Engine**.
3. Ở ô **Server name**, nhập server/instance của chính máy bạn. Ví dụ minh họa có thể là `.\\SQLEXPRESS`, `localhost\\SQLEXPRESS`, `TENMAY\\SQLEXPRESS` hoặc `localhost,1433`. Các ví dụ này không phải tên bắt buộc.
4. Chọn **Windows Authentication** nếu SQL Server của bạn được cấu hình xác thực bằng tài khoản Windows. Nếu môi trường nhóm được cấu hình kiểu xác thực khác, dùng thông tin do quản trị viên cung cấp.
5. Nhấn **Connect**. Nếu không kết nối được, xác minh tên instance và trạng thái SQL Server service trước khi tiếp tục.

> **Phân biệt hai giá trị:** `Server name` trong SSMS là tên/instance để kết nối tới SQL Server. `DB_URL` của ứng dụng Java có thể dùng hostname và TCP port, ví dụ `localhost:1433`. Hai chuỗi này không nhất thiết giống nhau.

### 1.2. Kiểm tra máy chủ đang kết nối

Sau khi kết nối, mở **New Query** và chạy:

```sql
SELECT @@SERVERNAME AS server_name,
       DB_NAME() AS current_database,
       SUSER_SNAME() AS login_name;
GO

SELECT @@VERSION AS full_version,
       SERVERPROPERTY('Edition') AS edition,
       SERVERPROPERTY('ProductVersion') AS product_version,
       SERVERPROPERTY('InstanceName') AS instance_name;
```

Lưu lại `server_name`, `instance_name` và `edition` thực tế để ghi vào ticket PS-73. Không điền tên server của người khác vào tài liệu dùng chung.

### 1.3. Kiểm tra database `LegacyVault`

```sql
SELECT name, state_desc
FROM sys.databases
WHERE name = N'LegacyVault';
```

Nếu kết quả có database `LegacyVault` và trạng thái `ONLINE`, kiểm tra đó có đúng là database phát triển bạn được phép sử dụng. Nếu chưa tồn tại, chỉ tạo mới trên SQL Server local/dev sau khi xác nhận quyền và đúng môi trường.

Để tạo database mới trong SSMS: nhấp phải **Databases → New Database… → nhập `LegacyVault` → OK**. Hoặc chạy SQL sau khi đã xác nhận đang kết nối đúng server local/dev:

```sql
CREATE DATABASE [LegacyVault];
```

> **Cảnh báo dữ liệu:** Không tạo database trùng tên trên server dùng chung và không xóa/reset database để làm theo hướng dẫn. Nếu `LegacyVault` đã tồn tại, không chạy `CREATE DATABASE` lần nữa.

### 1.4. Xác định cổng TCP nếu ứng dụng dùng JDBC qua localhost

Nếu cấu hình Backend sử dụng `localhost:1433`, SQL Server phải lắng nghe trên TCP port `1433`. Nếu máy bạn dùng cổng khác, hãy dùng cổng thực tế trong `DB_URL`.

```sql
SELECT local_net_address, local_tcp_port, auth_scheme
FROM sys.dm_exec_connections
WHERE session_id = @@SPID;
```

Truy vấn này có thể không hiển thị port mong đợi nếu kết nối SSMS hiện tại dùng Shared Memory hoặc Named Pipes. Khi cần, kiểm tra TCP/IP và port trong SQL Server Configuration Manager. Nếu thay đổi TCP/IP hoặc port, có thể cần khởi động lại SQL Server service. Không mở cổng SQL Server ra Internet.

### 1.5. Kiểm tra quyền database

Backend sẽ cần kết nối vào `LegacyVault`. Tài khoản Windows chạy IntelliJ phải được SQL Server cho phép đăng nhập và có đủ quyền cho migration theo chính sách nhóm. Nếu SSMS kết nối được nhưng ứng dụng không kết nối được, xác minh tài khoản thực tế, `DB_URL`, TCP port và quyền database.

## 2. Lấy mã nguồn và mở Backend

Nếu đã có repository trên máy, chuyển tới thư mục đó; không clone lần nữa. Nếu chưa có, clone repository:

```bash
git clone https://github.com/Abaddon8386/LegacyVault.git
cd LegacyVault
```

Kiểm tra branch trước khi sửa/chạy migration:

```bash
git status --short --branch
git fetch origin
git switch feature/PS-73-database-setup
git pull --ff-only origin feature/PS-73-database-setup
```

Nếu nhóm đã giao branch khác, sử dụng branch được giao. Nếu có thay đổi chưa commit, dừng lại và kiểm tra chúng; không dùng lệnh xóa thay đổi một cách máy móc.

1. Mở IntelliJ IDEA → **File → Open** → chọn repository `LegacyVault`.
2. Mở `backend/pom.xml` và chờ IntelliJ nhận diện Maven.
3. Mở Maven tool window → **Reload All Maven Projects**.
4. Xác nhận Project SDK/Maven runner dùng phiên bản JDK mà dự án yêu cầu (môi trường hiện tại đã sử dụng Java 25).

## 3. Cài đặt Flyway cho Spring Boot

Trong dự án này, Flyway được thêm như dependency Maven và chạy cùng Backend Spring Boot. Không cần cài một chương trình Flyway CLI riêng để chạy migration khi ứng dụng đã được cấu hình tích hợp Flyway.

### 3.1. Thêm dependency vào `backend/pom.xml`

1. Mở `backend/pom.xml`.
2. Tìm phần `<dependencies>`.
3. Thêm hai dependency dưới đây bên trong `<dependencies>`. Trước khi thêm, kiểm tra xem chúng đã có chưa để tránh khai báo trùng.

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-flyway</artifactId>
</dependency>
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-sqlserver</artifactId>
</dependency>
```

Giữ nguyên cấu trúc và các dependency hiện có. Nếu nhóm đã quản lý dependency version bằng Spring Boot BOM, không tự thêm version riêng trừ khi Maven báo cần thiết theo cấu hình dự án.

### 3.2. Tải dependency Flyway

1. Lưu `backend/pom.xml`.
2. Trong IntelliJ, mở Maven tool window và chọn **Reload All Maven Projects**.
3. Chờ Maven tải dependency. Kiểm tra cửa sổ Build/Maven để chắc chắn không có lỗi resolve artifact.
4. Có thể kiểm tra trong terminal tại thư mục `backend` bằng lệnh:

```bash
mvn dependency:tree
```

Nếu máy không nhận lệnh `mvn`, dùng Maven wrapper nếu repository có `mvnw.cmd`, hoặc cấu hình Maven trong IntelliJ. Không tải JAR ngẫu nhiên từ website không đáng tin cậy.

### 3.3. Vị trí file migration

Cấu hình đang được hướng dẫn cho dự án dùng thư mục migration ở root repository:

```text
LegacyVault/
├── backend/
│   └── pom.xml
└── database/
    ├── migration/
    │   └── V1__create_initial_schema.sql
    └── seed/
        └── seed_test_data.sql
```

Tên file ví dụ minh họa quy tắc đặt tên Flyway: `V` + phiên bản + hai dấu gạch dưới + mô tả + `.sql`. Dùng file migration thật đang có trong branch, không tạo file trùng phiên bản đã tồn tại.

### 3.4. Đóng gói migration vào classpath

Giữ các file SQL trong root repository tại `database/migration/`. Không cần chuyển chúng vào `backend/src/main/`. Để Flyway tìm migration ổn định khi chạy từ IntelliJ, Maven hoặc file JAR, cấu hình Maven sao chép migration vào classpath.

Trong `backend/pom.xml`, tìm phần `<build>`. Nếu đã có `<resources>`, thêm resource migration vào danh sách hiện có; không tạo khối `<resources>` thứ hai:

```xml
<resources>
    <resource>
        <directory>src/main/resources</directory>
    </resource>
    <resource>
        <directory>../database/migration</directory>
        <targetPath>db/migration</targetPath>
        <filtering>false</filtering>
    </resource>
</resources>
```

Resource đầu tiên giữ các file cấu hình backend hiện có. Resource thứ hai đóng gói `../database/migration` thành `db/migration` trong classpath của ứng dụng.

Mở `backend/src/main/resources/application.yaml` và dùng cấu hình:

```yaml
spring:
  datasource:
    url: ${DB_URL}
    driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
  flyway:
    enabled: true
    locations: classpath:db/migration
  jpa:
    hibernate:
      ddl-auto: none
    database-platform: org.hibernate.dialect.SQLServerDialect
```

Sau khi sửa `pom.xml`, reload Maven rồi chạy từ thư mục `backend`:

```bash
./mvnw clean process-resources
```

Trên Windows PowerShell dùng `.\mvnw.cmd clean process-resources`. Xác nhận các file migration xuất hiện trong `backend/target/classes/db/migration/`. Cách này không phụ thuộc Working directory.

> **Không để Hibernate tự tạo schema:** Giữ `spring.jpa.hibernate.ddl-auto: none`. Flyway quản lý migration; không đổi sang `create/update` để né lỗi.

## 4. Cấu hình kết nối Backend tới `LegacyVault`

### 4.1. Cấu hình `DB_URL`

Trong IntelliJ, mở **Run → Edit Configurations → chọn cấu hình Spring Boot → Environment variables**. Thêm biến `DB_URL`. Với SQL Server local đã cấu hình TCP port `1433` và Windows Integrated Authentication, giá trị mẫu là:

```text
DB_URL=jdbc:sqlserver://localhost:1433;databaseName=LegacyVault;encrypt=true;trustServerCertificate=true;integratedSecurity=true
```

Database name phải là `LegacyVault`. Nếu SQL Server của bạn không lắng nghe ở `localhost:1433`, thay hostname/port bằng endpoint thực tế. Server name của mỗi thành viên có thể khác; không chép nguyên tên máy/instance của người khác.

Nếu dùng Windows Integrated Authentication, tài khoản chạy ứng dụng phải có quyền trên SQL Server. Nếu nhóm dùng SQL Authentication thay vì Windows Authentication, cần cấu hình username/password theo quy định nhóm và không commit thông tin đăng nhập vào Git.

### 4.2. Xác nhận Working directory

1. Trong **Run → Edit Configurations**, tìm trường **Working directory**.
2. Working directory có thể là thư mục `backend`; migration được nạp từ `classpath:db/migration` nên không phụ thuộc Working directory.
3. Lưu cấu hình. Nếu ứng dụng báo không tìm thấy migration, kiểm tra Maven resource configuration và `target/classes/db/migration/`.

### 4.3. Xác minh database trước khi chạy

Trong SSMS, chạy:

```sql
SELECT DB_NAME() AS current_database,
       SUSER_SNAME() AS login_name;
```

Nếu cần, chọn database đúng bằng:

```sql
USE [LegacyVault];
GO
```

Xác nhận `DB_NAME()` trả về `LegacyVault` khi chạy các truy vấn kiểm tra. Luôn kiểm tra server và database trước khi chạy script thay đổi dữ liệu.

## 5. Chạy Flyway migration

### 5.1. Kiểm tra migration hiện có

1. Mở `database/migration` và xem file migration đã commit trên branch.
2. Không sửa file migration đã được áp dụng trên database dùng chung; nếu cần thay đổi schema, tạo migration phiên bản tiếp theo theo quy ước nhóm.
3. Đảm bảo dependency Flyway đã tải thành công, `DB_URL` đúng và migration đã được đóng gói vào classpath.
4. Migration phải đặt `DEFAULT NEWID()` cho 10 cột `public_id` để seed/SQL INSERT có thể bỏ qua cột này; ứng dụng vẫn có thể tự gán UUID. Schema cũng phải cho phép lưu lịch sử Trustee, chỉ giới hạn một bản ghi `APPOINTED` mỗi Vault, yêu cầu ít nhất một trong phone/email và đặt grace period mặc định 1 ngày. Mỗi Owner chỉ được có một Vault; API trả `409 Conflict` khi tạo Vault thứ hai. Xác nhận các migration cần thiết có trong branch và chạy đúng thứ tự version.
5. Nếu migration V2/V3 từng thất bại, xem log và `flyway_schema_history` trước khi thử lại. Không sửa migration đã áp dụng thành công trên database dùng chung; nếu cần điều chỉnh schema sau đó, tạo migration phiên bản kế tiếp. Chỉ sửa file migration bị lỗi và chưa được áp dụng thành công sau khi xác nhận trạng thái của tất cả môi trường nhóm.

### 5.2. Chạy ứng dụng

1. Mở lớp main của Spring Boot trong `backend`.
2. Nhấn **Run** với cấu hình đã khai báo `DB_URL`.
3. Theo dõi log. Flyway sẽ kiểm tra lịch sử migration và áp dụng migration chưa chạy.
4. Nếu có lỗi kết nối hoặc migration, dừng tại đây và xử lý lỗi trước khi chạy seed.

### 5.3. Kiểm tra lịch sử migration

```sql
USE [LegacyVault];
GO

SELECT installed_rank, version, description, type, script,
       installed_on, success
FROM dbo.flyway_schema_history
ORDER BY installed_rank;
```

Kết quả mong đợi: migration đã chạy được ghi trong `flyway_schema_history` và `success = 1`. Nếu bảng không tồn tại, xác nhận đúng database, `flyway.locations` và log khởi động. Không tự tạo bảng lịch sử Flyway bằng tay.

### 5.4. Kiểm tra các bảng

```sql
SELECT TABLE_SCHEMA, TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_SCHEMA, TABLE_NAME;
```

Data Dictionary UUID mới gồm 14 bảng: `users`, `roles`, `user_roles`, `vaults`, `assets`, `asset_versions`, `trustees`, `beneficiaries`, `asset_allocations`, `dms_configs`, `vitality_check_logs`, `audit_logs`, `legal_documents` và `legal_verifications`. Danh sách thực tế phải được xác nhận bằng truy vấn trên database của bạn; có thể xuất hiện thêm bảng metadata Flyway.

Theo Data Dictionary mới, các bảng tài nguyên được chỉ định có `public_id` kiểu `UNIQUEIDENTIFIER UNIQUE NOT NULL` để dùng làm mã công khai trong API; khóa nội bộ vẫn là `BIGINT`. Không đưa các ID `BIGINT` nội bộ ra API công khai. Bản cập nhật hiện tại cũng có:
- `users.deleted_at DATETIME2 NULL` cho xóa mềm.
- `beneficiaries.date_of_birth DATE NULL` và `beneficiaries.relationship_to_owner NVARCHAR(100) NULL`.
- `asset_versions` để lưu phiên bản file và SHA-256; `legal_documents` và `legal_verifications` để quản lý hồ sơ/xác minh pháp lý.

Các cột mới trong Data Dictionary chỉ có hiệu lực trên database sau khi migration tương ứng đã chạy thành công. Kiểm tra schema thật trước khi seed hoặc chạy API.

### 5.5. Nguyên tắc migration khi làm nhóm

- Không chạy script reset hoặc xóa database trong quy trình setup.
- Không sửa migration đã chạy trên database dùng chung; tạo migration phiên bản mới.
- Không tạo file migration có version trùng với file đã tồn tại.
- Không dùng `spring.jpa.hibernate.ddl-auto=create/update` để thay thế Flyway.
- Lưu log thành công và kết quả `flyway_schema_history` vào ticket PS-73.

## 6. Nạp dữ liệu thử nghiệm (seed)

Chỉ thực hiện sau khi migration thành công. Dữ liệu seed phục vụ kiểm thử, không phải dữ liệu thật.

1. Mở `database/seed/seed_test_data.sql` và đọc script trước khi chạy.
2. Nếu script yêu cầu BCrypt hash, thay placeholder bằng hash được tạo cho mật khẩu demo; không dùng mật khẩu cá nhân và không commit mật khẩu rõ.
3. Trong SSMS, xác nhận đang kết nối đúng SQL Server và database `LegacyVault`.
4. Mở script seed, chạy và đọc tab **Messages/Results**. Nếu có lỗi, không chạy lặp lại ngay; kiểm tra xem dữ liệu đã được thêm một phần hay chưa.
5. Xác minh dữ liệu bằng truy vấn:

```sql
USE [LegacyVault];
GO

SELECT 'users' AS table_name, COUNT_BIG(*) AS row_count FROM dbo.users
UNION ALL SELECT 'vaults', COUNT_BIG(*) FROM dbo.vaults
UNION ALL SELECT 'assets', COUNT_BIG(*) FROM dbo.assets
UNION ALL SELECT 'beneficiaries', COUNT_BIG(*) FROM dbo.beneficiaries
UNION ALL SELECT 'trustees', COUNT_BIG(*) FROM dbo.trustees
UNION ALL SELECT 'asset_allocations', COUNT_BIG(*) FROM dbo.asset_allocations
UNION ALL SELECT 'dms_configs', COUNT_BIG(*) FROM dbo.dms_configs
UNION ALL SELECT 'vitality_check_logs', COUNT_BIG(*) FROM dbo.vitality_check_logs
UNION ALL SELECT 'asset_versions', COUNT_BIG(*) FROM dbo.asset_versions
UNION ALL SELECT 'legal_documents', COUNT_BIG(*) FROM dbo.legal_documents
UNION ALL SELECT 'legal_verifications', COUNT_BIG(*) FROM dbo.legal_verifications;
```

Các bản ghi đã được xác nhận trước đây gồm một Owner thử nghiệm, một Vault, hai Assets, hai Beneficiaries và hai Asset Allocations. Các bảng Trustee, DMS config và vitality log cần được xác nhận bằng kết quả thực tế.

> **Giới hạn seed:** `encrypted_payload` và `encryption_iv` trong dữ liệu thử nghiệm là byte giả, không phải payload đã được mã hóa thật và không thể dùng để chứng minh luồng giải mã.

## 7. Kiểm tra roles và Admin

### 7.1. Kiểm tra roles

```sql
SELECT role_id, role_code, role_name
FROM dbo.roles
ORDER BY role_id;
```

Các role code đã được ghi nhận: `ROLE_VAULT_OWNER`, `ROLE_STAFF_EXECUTOR`, `ROLE_LEGAL_VERIFIER`, `ROLE_ADMIN` và `ROLE_BENEFICIARY`.

### 7.2. Kiểm tra tài khoản được gán `ROLE_ADMIN`

```sql
SELECT u.user_id, u.full_name, u.email, u.status, r.role_code
FROM dbo.users u
JOIN dbo.user_roles ur ON ur.user_id = u.user_id
JOIN dbo.roles r ON r.role_id = ur.role_id
WHERE r.role_code = 'ROLE_ADMIN';
```

Theo schema hiện tại, cột ghi nhận người gán role là `assigned_by_user_id`, không phải `assigned_by`. Tài khoản Admin đã được tạo trước đó; kiểm tra trước khi tạo thêm. Có bản ghi role không tự chứng minh chức năng đăng nhập đã hoạt động. Chính sách bootstrap Admin lâu dài vẫn cần nhóm thống nhất.

## 8. Kiểm tra khóa và quan hệ

### 8.1. Foreign keys

```sql
SELECT fk.name AS foreign_key_name,
       OBJECT_NAME(fk.parent_object_id) AS table_name,
       COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS column_name,
       OBJECT_NAME(fk.referenced_object_id) AS referenced_table,
       COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS referenced_column
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc
  ON fk.object_id = fkc.constraint_object_id
ORDER BY table_name, foreign_key_name;
```

### 8.2. Primary keys và unique indexes

```sql
SELECT t.name AS table_name, i.name AS index_name,
       i.is_unique, i.is_primary_key
FROM sys.tables t
JOIN sys.indexes i ON i.object_id = t.object_id
WHERE i.is_unique = 1 OR i.is_primary_key = 1
ORDER BY t.name, i.name;
```

### 8.3. Kiểm tra một số quan hệ

```sql
SELECT v.vault_id, v.owner_user_id
FROM dbo.vaults v
LEFT JOIN dbo.users u ON u.user_id = v.owner_user_id
WHERE u.user_id IS NULL;

SELECT a.asset_id, a.vault_id
FROM dbo.assets a
LEFT JOIN dbo.vaults v ON v.vault_id = a.vault_id
WHERE v.vault_id IS NULL;
```

Các truy vấn trên kỳ vọng không trả về dòng nào. Nếu có dòng, lưu kết quả và xác minh nguyên nhân trước khi sửa dữ liệu.

## 9. Xử lý lỗi thường gặp

| Lỗi/triệu chứng | Nguyên nhân có thể | Cách xử lý đầu tiên |
|---|---|---|
| SSMS không kết nối được | Server name/instance sai hoặc service dừng. | Xác nhận tên instance trên máy, SQL Server service và authentication. |
| `DB_URL is not set` | Chưa khai báo biến môi trường. | Thêm `DB_URL` trong IntelliJ Run Configuration. |
| `Connection refused` | TCP/IP tắt hoặc port sai. | Kiểm tra TCP/IP, port thực tế và endpoint trong `DB_URL`. |
| `Login failed for user` | Tài khoản chạy ứng dụng không có quyền. | So sánh tài khoản Windows của SSMS/IntelliJ và yêu cầu quản trị viên cấp quyền. |
| `Cannot open database LegacyVault` | Database không tồn tại/offline hoặc thiếu quyền. | Kiểm tra `sys.databases` và quyền; không tạo database trên server chia sẻ nếu chưa được phép. |
| Flyway không tìm thấy migration | Migration chưa được đóng gói vào classpath hoặc cấu hình location sai. | Kiểm tra `<resources>` trong `backend/pom.xml`, chạy `process-resources`, xác nhận `target/classes/db/migration/` có file và dùng `classpath:db/migration`. |
| Flyway checksum mismatch | File migration đã chạy bị sửa. | Không sửa metadata thủ công; khôi phục migration đã commit hoặc thống nhất migration mới với nhóm. |
| `Invalid object name` | Migration chưa chạy hoặc đang query nhầm database/schema. | Kiểm tra `DB_NAME()`, `flyway_schema_history` và danh sách bảng. |
| `Invalid column name assigned_by` | Dùng tên cột cũ. | Dùng `assigned_by_user_id` theo schema hiện tại. |
| Maven không tải được Flyway | Maven chưa reload, mạng/repository hoặc POM lỗi. | Reload Maven, xem lỗi đầu tiên trong Build output; kiểm tra artifact/dependency và không thêm dependency trùng. |
| Seed duplicate key | Dữ liệu đã tồn tại hoặc script không idempotent. | Dừng, kiểm tra dữ liệu theo khóa định danh và đọc script trước khi chạy lại. |

## 10. Checklist hoàn tất PS-73

- [ ] Đã kết nối đúng SQL Server trên máy cá nhân; server/instance name được ghi nhận từ môi trường thực tế.
- [ ] Database `LegacyVault` tồn tại và ở trạng thái `ONLINE`.
- [ ] `backend/pom.xml` có dependency Flyway cần thiết, không bị khai báo trùng.
- [ ] Maven tải dependency thành công.
- [ ] `backend/pom.xml` đóng gói `../database/migration` vào `db/migration`; `application.yaml` dùng `classpath:db/migration`.
- [ ] `DB_URL` trỏ đúng endpoint SQL Server và `databaseName=LegacyVault`.
- [ ] `spring.jpa.hibernate.ddl-auto` vẫn là `none`.
- [ ] Backend khởi động và Flyway migration chạy thành công.
- [ ] `flyway_schema_history` ghi nhận migration `success = 1`.
- [ ] Đã kiểm tra đủ các bảng theo Data Dictionary mới, bao gồm `asset_versions`, `legal_documents`, `legal_verifications`.
- [ ] Đã xác nhận `public_id`, `users.deleted_at`, `beneficiaries.date_of_birth` và `beneficiaries.relationship_to_owner` tồn tại sau migration.
- [ ] Danh sách roles, dữ liệu seed và khóa/quan hệ đã được kiểm tra.
- [ ] Không có mật khẩu, token, key hoặc dữ liệu cá nhân thật trong Git/tài liệu.
- [ ] Đã lưu log/ảnh chụp/kết quả SQL cần thiết vào ticket PS-73 hoặc vị trí nhóm thống nhất.

### Điều kiện đề xuất đóng công việc

Đề xuất hoàn tất phần database setup khi thành viên khác có thể làm theo tài liệu trên máy của mình, kết nối đúng database `LegacyVault`, chạy Flyway thành công, xác nhận schema và seed dữ liệu giả, đồng thời cung cấp bằng chứng. Migration thành công không đồng nghĩa các chức năng đăng nhập, giải mã payload, DMS scheduler hoặc luồng bàn giao đã được kiểm thử.

## Tài liệu tham khảo chính thức

- SQL Server downloads: https://www.microsoft.com/en-us/sql-server/sql-server-downloads
- SSMS downloads: https://learn.microsoft.com/sql/ssms/download-sql-server-management-studio-ssms
- Flyway documentation: https://documentation.red-gate.com/flyway
- Spring Boot documentation: https://docs.spring.io/spring-boot/

