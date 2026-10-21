# Hướng dẫn demo kết nối Database – Backend – Frontend (từng bước)

Làm lần lượt từ Bước 1 đến Bước 9, **không bỏ bước**. Mỗi bước có: việc phải làm, kết quả đúng cần thấy, và cách xử lý nếu sai.
Mọi lệnh chạy trong **Windows PowerShell** (không phải Git Bash) trừ khi ghi khác.

```text
Trình duyệt ──► Frontend (Vite, cổng 5173) ──/api──► Backend (Spring Boot, cổng 8080) ──JDBC──► SQL Server (database LegacyVault)
```

## Quy tắc an toàn (đọc trước)
- Chỉ làm trên **SQL Server cài trên máy bạn**. Không trỏ vào server dùng chung của nhóm.
- Không xóa/reset database để "cho sạch". Muốn làm lại từ đầu thì tạo database mới tên khác (Bước 2.4).
- Không commit mật khẩu, khóa bí mật, file `.env` thật hay file seed đã sửa.
- Khóa `LEGACYVAULT_ENCRYPTION_KEY` đã dùng cho một database thì **không đổi nữa**, nếu không dữ liệu đã mã hóa không đọc được.

---

## Bước 1. Cài và kiểm tra công cụ

1. Mở PowerShell (Start → gõ `PowerShell` → Enter) rồi chạy từng lệnh:

```powershell
git --version
java -version
node --version
npm.cmd --version
```

2. **Kết quả đúng:** `java -version` hiện phiên bản **25** (ví dụ `openjdk version "25..."`), `node` từ 20 trở lên (nhóm đã kiểm với 24.x), `npm` có số phiên bản.
3. Nếu `java -version` không phải 25: cài JDK 25, rồi đặt `JAVA_HOME`:
   - Start → gõ `Edit the system environment variables` → **Environment Variables…** → mục *User variables* → **New…**
   - Name: `JAVA_HOME`, Value: thư mục cài JDK (ví dụ `C:\Program Files\Java\jdk-25`) → OK.
   - **Đóng PowerShell và mở lại**, chạy `java -version` lần nữa.
4. Cần có **SQL Server** (Express hoặc Developer) và **SSMS** trên máy. Chưa có thì cài trước.

## Bước 2. Chuẩn bị database

### 2.1 Kết nối SQL Server bằng SSMS
1. Mở **SQL Server Management Studio**.
2. Hộp thoại *Connect to Server*: *Server type* = Database Engine. Ô **Server name** nhập một trong các giá trị sau (thử lần lượt đến khi vào được): `localhost`, `.\SQLEXPRESS`, `localhost\SQLEXPRESS`, `localhost,1433`.
3. *Authentication* = **Windows Authentication**. Tick **Trust server certificate** nếu có. Bấm **Connect**.
4. Bấm **New Query** (nút trên thanh công cụ) và chạy (bấm **Execute** hoặc F5):

```sql
SELECT @@SERVERNAME AS server_name, SUSER_SNAME() AS login_name, @@VERSION AS version;
```

Ghi lại `server_name` (phần sau dấu `\` là tên instance, nếu có).

### 2.2 Bật TCP/IP và biết cổng (cần để Backend kết nối)
1. Start → gõ `SQL Server Configuration Manager` → mở.
2. *SQL Server Network Configuration* → **Protocols for <tên instance>** → chuột phải **TCP/IP** → **Enable** (nếu đang Disabled).
3. Chuột phải **TCP/IP** → **Properties** → tab **IP Addresses** → kéo xuống mục **IPAll** → nhìn **TCP Port**. Nếu trống và có *TCP Dynamic Ports*, hãy nhập **TCP Port = 1433** (xóa ô Dynamic Ports) → OK.
4. *SQL Server Services* → chuột phải **SQL Server (<tên instance>)** → **Restart**.
5. **Kết quả đúng:** kiểm tra bằng PowerShell:

```powershell
Test-NetConnection localhost -Port 1433
```
Thấy `TcpTestSucceeded : True`. Nếu `False`: cổng của bạn khác 1433 hoặc TCP/IP chưa bật; làm lại bước 2–4.

### 2.3 Tạo database `LegacyVault`
Trong SSMS (New Query):

```sql
SELECT name, state_desc FROM sys.databases WHERE name = N'LegacyVault';
```
- Nếu **đã có** dòng `LegacyVault | ONLINE`: dùng luôn, **không** chạy `CREATE DATABASE` lần nữa.
- Nếu **không có dòng nào**:

```sql
CREATE DATABASE [LegacyVault];
```
Làm mới *Databases* trong Object Explorer (F5) sẽ thấy `LegacyVault`. Bạn **không cần tạo bảng**: Backend tự tạo khi khởi động (Bước 4).

### 2.4 (Tuỳ chọn) Muốn demo "sạch"
Tạo database tên khác, ví dụ `CREATE DATABASE [LegacyVault_Demo];`, rồi ở Bước 3 đổi `databaseName=LegacyVault_Demo`. Không xóa `LegacyVault` cũ.

### 2.5 Chọn cách đăng nhập từ Backend
Có hai cách. **Khuyến nghị cách B** vì ít lỗi hơn.

**A. Windows Authentication:** không cần tài khoản riêng, nhưng Java cần file DLL xác thực `mssql-jdbc_auth-<phiên bản>.x64.dll` (có trong gói tải Microsoft JDBC Driver for SQL Server, thư mục `auth\x64`). Đặt file vào một thư mục, ví dụ `C:\tools\jdbc-auth\`, và xem mục xử lý lỗi cuối tài liệu.

**B. SQL Login:** trong SSMS, tạo tài khoản riêng cho ứng dụng (chỉ trên máy local):

```sql
CREATE LOGIN legacyvault_app WITH PASSWORD = N'Đặt-mật-khẩu-mạnh-ở-đây-1!', CHECK_POLICY = OFF;
USE [LegacyVault];
CREATE USER legacyvault_app FOR LOGIN legacyvault_app;
ALTER ROLE db_owner ADD MEMBER legacyvault_app;   -- cần để Flyway tạo bảng, trigger
```
Nếu báo lỗi đăng nhập SQL: bật chế độ hỗn hợp. Trong SSMS, chuột phải tên server (gốc cây) → **Properties** → **Security** → chọn **SQL Server and Windows Authentication mode** → OK → restart service SQL Server (như 2.2 bước 4).

## Bước 3. Đặt biến môi trường cho Backend

Backend **cần 3 biến** và sẽ không khởi động nếu thiếu: `DB_URL`, `JWT_SECRET_BASE64`, `LEGACYVAULT_ENCRYPTION_KEY`.

### 3.1 Sinh hai khóa bí mật (làm MỘT LẦN, lưu lại)
Dán vào PowerShell:

```powershell
$b = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Environment]::SetEnvironmentVariable('LEGACYVAULT_ENCRYPTION_KEY', [Convert]::ToBase64String($b), 'User')

$b = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Environment]::SetEnvironmentVariable('JWT_SECRET_BASE64', [Convert]::ToBase64String($b), 'User')
```
Không có thông báo gì là bình thường.

### 3.2 Đặt `DB_URL`
Chọn **một** trong hai (thay `<...>` bằng giá trị của bạn; cổng và tên instance lấy ở Bước 2):

```powershell
# Cách B - SQL Login (khuyến nghị)
[Environment]::SetEnvironmentVariable('DB_URL', 'jdbc:sqlserver://localhost:1433;databaseName=LegacyVault;user=legacyvault_app;password=<mật khẩu ở 2.5>;encrypt=true;trustServerCertificate=true', 'User')

# Cách A - Windows Authentication
[Environment]::SetEnvironmentVariable('DB_URL', 'jdbc:sqlserver://localhost:1433;databaseName=LegacyVault;encrypt=true;trustServerCertificate=true;integratedSecurity=true', 'User')
```

### 3.3 Kiểm tra biến đã có
**Đóng PowerShell, mở cửa sổ mới** (biến chỉ có hiệu lực ở cửa sổ mới), rồi:

```powershell
"DB_URL=" + [bool]$env:DB_URL
"JWT=" + [bool]$env:JWT_SECRET_BASE64
"KEY=" + [bool]$env:LEGACYVAULT_ENCRYPTION_KEY
```
**Kết quả đúng:** cả ba dòng ghi `True`. (Cố ý không in giá trị để không lộ bí mật.)

## Bước 4. Chạy Backend

Mở **PowerShell thứ nhất**, đi tới thư mục dự án (đổi đường dẫn cho đúng máy bạn):

```powershell
cd D:\FPT\Ky5\SWP391\Project\Legacy_Vault\backend
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"
```

Nếu dùng **Windows Authentication**, thêm biến trỏ tới thư mục DLL trước khi chạy:
```powershell
$env:JAVA_TOOL_OPTIONS = '-Djava.library.path=C:\tools\jdbc-auth'
```

1. Lần đầu Maven tải thư viện nên chờ vài phút.
2. Log sẽ có các dòng của Flyway liệt kê từng migration (`Migrating schema [dbo] to version "1 ..."` … đến V30). **Giữ cửa sổ này mở.**
3. **Kết quả đúng:** cuối log có dòng giống `Started LegacyvaultBackendApplication in ... seconds`, và không có chữ `ERROR` đỏ.
4. Mở **cửa sổ PowerShell thứ hai** và kiểm tra:

```powershell
Invoke-RestMethod http://localhost:8080/api/v1/system/ping
Invoke-RestMethod http://localhost:8080/api/v1/system/db-check
```
Kết quả đúng: `status : UP` và `database : UP`. (`db-check` chỉ tồn tại khi có `-Dspring-boot.run.profiles=dev`; thiếu thì trả 404.)

5. Trong SSMS chạy để thấy Flyway đã tạo schema:

```sql
USE LegacyVault;
SELECT TOP 5 installed_rank, version, description, success FROM flyway_schema_history ORDER BY installed_rank DESC;
SELECT COUNT(*) AS so_bang FROM sys.tables;
```
Cột `success` phải là `1`. Số bảng lớn hơn 0 (khoảng vài chục).

**Nếu Backend dừng với lỗi:** xem bảng lỗi ở cuối tài liệu.

## Bước 5. Chạy Frontend

Mở **PowerShell thứ ba**:

```powershell
cd D:\FPT\Ky5\SWP391\Project\Legacy_Vault\frontend
npm.cmd ci
npm.cmd run dev
```
1. Lần đầu `npm ci` tải thư viện, chờ 1–3 phút.
2. **Kết quả đúng:** hiện `Local: http://localhost:5173/`.
3. Mở trình duyệt, vào `http://localhost:5173/register`. Thấy form đăng ký là FE đã chạy.
4. Backend chạy cổng khác 8080? Dừng FE (Ctrl+C) rồi chạy: `$env:API_PROXY_TARGET='http://localhost:<cổng>'; npm.cmd run dev`.

Lúc này bạn có **3 cửa sổ**: (1) Backend, (2) lệnh kiểm tra, (3) Frontend.

## Bước 6. Demo luồng Owner (dữ liệu thật vào SQL Server)

Thực hiện trên trình duyệt `http://localhost:5173`. Sau mỗi thao tác, nếu muốn chứng minh, chạy truy vấn ở Bước 7.

1. **Đăng ký** (`/register`): nhập Họ tên, Email (ví dụ `owner.demo@example.com`), Mật khẩu (8–72 ký tự), Số điện thoại (tuỳ chọn) → gửi. Vai trò được gán: Vault Owner.
2. **Đăng nhập** (`/login`) bằng email và mật khẩu vừa tạo. Vào trang kho (`/vault`).
3. **Tạo kho (Vault):** bấm nút tạo kho. Mỗi Owner chỉ có một kho; trạng thái `ACTIVE`.
4. **Thêm tài sản:** vào mục tài sản, thêm một tài sản (tên, loại, nội dung). Nội dung được mã hóa trước khi lưu.
5. **Tải bản scan di chúc:** chọn file PDF/JPEG/PNG (tối đa 10 MB). Hệ thống tính SHA-256 và tạo phiên bản.
6. **Khai báo Trustee (tuỳ chọn) và Beneficiary:** cần ít nhất một Beneficiary.
7. **Bật Dead Man's Switch:** đặt chu kỳ check-in (ví dụ 30 ngày) và bấm check-in thử.

> Nếu một nút/màn hình ở trên khác tên so với giao diện bạn thấy, cứ theo thứ tự nghiệp vụ trên; tên hiển thị có thể thay đổi giữa các nhánh.

## Bước 7. Chứng minh dữ liệu đã vào SQL Server

Trong SSMS (New Query, đảm bảo đang ở database `LegacyVault`):

```sql
USE LegacyVault;

-- 1) Tài khoản: mật khẩu là chuỗi băm BCrypt, KHÔNG phải mật khẩu thật
SELECT TOP 3 user_id, email, status, LEFT(password_hash, 7) AS dau_hash FROM dbo.users ORDER BY user_id DESC;

-- 2) Kho vừa tạo
SELECT TOP 3 vault_id, owner_user_id, status FROM dbo.vaults ORDER BY vault_id DESC;

-- 3) Tài sản: nội dung là byte đã mã hóa, đọc không ra chữ
SELECT TOP 3 asset_id, vault_id, DATALENGTH(encrypted_payload) AS so_byte_ma_hoa FROM dbo.assets ORDER BY asset_id DESC;

-- 4) Nhật ký kiểm toán (chỉ thêm, không sửa/xóa)
SELECT TOP 8 action, entity_type, occurred_at FROM dbo.audit_logs ORDER BY audit_log_id DESC;
```
**Kết quả đúng:** thấy đúng email vừa đăng ký, `dau_hash` bắt đầu bằng `$2a$` hoặc `$2b$`, có dòng kho và tài sản mới, và các hành động trong `audit_logs` (đăng ký, đăng nhập, tạo kho, tạo tài sản...).

## Bước 8. Demo vai trò Staff / Legal / Admin / Beneficiary (cần seed)

Tài khoản tự đăng ký chỉ là Owner. Các vai trò khác có sẵn trong file `database/seed/seed_test_data.sql`:

| Email | Vai trò | Màn hình chính sau đăng nhập |
|---|---|---|
| `seed.executor@legacyvault.local` | Staff Executor | `/staff/cases` |
| `seed.verifier@legacyvault.local` | Legal Verifier | `/legal/...` (xác minh, thẩm định) |
| `seed.admin@legacyvault.local` | System Admin | — |
| `seed.beneficiary1@legacyvault.local` | Beneficiary | — |
| `seed.owner@legacyvault.local` | Vault Owner (kho mẫu) | `/vault` |

### 8.1 Lấy chuỗi băm mật khẩu demo
1. Dùng tài khoản bạn đã đăng ký ở Bước 6 (mật khẩu bạn nhớ, ví dụ `DemoPass#2026`).
2. Trong SSMS:

```sql
SELECT password_hash FROM dbo.users WHERE email = N'owner.demo@example.com';
```
3. Bấm vào ô kết quả, **Ctrl+C** chép nguyên chuỗi (bắt đầu bằng `$2a$`/`$2b$`).

### 8.2 Sửa **bản sao** của file seed
1. Sao chép `database\seed\seed_test_data.sql` ra một thư mục ngoài dự án, ví dụ `C:\temp\seed_demo.sql`.
2. Mở bằng Notepad, tìm `REPLACE_WITH_BCRYPT_HASH` (dòng khai báo `@DemoBcryptHash`) và thay bằng chuỗi vừa chép (giữ nguyên dấu nháy đơn quanh chuỗi). Lưu file.
3. **Không** sửa file gốc trong dự án và không commit file này.

### 8.3 Chạy seed
Cách dễ nhất: trong SSMS, **File → Open → File…** chọn `C:\temp\seed_demo.sql` → kiểm tra dòng đầu là `USE [LegacyVault];` → bấm **Execute**.
(Hoặc dùng dòng lệnh: `sqlcmd -S localhost -E -C -i C:\temp\seed_demo.sql`.)

**Kết quả đúng:** không có lỗi đỏ. Kiểm tra:
```sql
SELECT email, status FROM dbo.users WHERE email LIKE N'seed.%@legacyvault.local';
```
Thấy 5–6 tài khoản seed. Seed chạy lại được và không xóa dữ liệu.

### 8.4 Đăng nhập thử từng vai trò
Mở cửa sổ ẩn danh (Ctrl+Shift+N) để không lẫn phiên, vào `http://localhost:5173/login`, đăng nhập `seed.executor@legacyvault.local` với **mật khẩu demo của bạn** (cùng mật khẩu bạn đã dùng ở 8.1). Thấy trang hàng chờ ca (`/staff/cases`). Lặp lại với `seed.verifier@...` để vào các màn Legal.

> Luồng xử lý di sản đầy đủ (DMS quá hạn → Staff nhận ca → Legal thẩm định → mở khóa → bàn giao → nghiệm thu → lưu trữ) đòi hỏi dữ liệu được tạo theo đúng thứ tự bởi nhiều vai trò. Xem hợp đồng API từng bước trong `docs/api-contracts/` và mô tả quy trình trong `00_Main_Flow_FINAL.md`.

## Bước 9. Dừng và dọn

1. Ở mỗi cửa sổ Backend/Frontend bấm **Ctrl+C**.
2. Không cần xóa gì trong database. Muốn demo lại từ đầu thì dùng database tên khác (Bước 2.4).

---

## Bảng lỗi thường gặp (tra cứu nhanh)

| Dấu hiệu | Nguyên nhân | Cách xử lý |
|---|---|---|
| Backend dừng, log có `Could not resolve placeholder 'DB_URL'` (hoặc `JWT_SECRET_BASE64`, `LEGACYVAULT_ENCRYPTION_KEY`) | Biến chưa có trong cửa sổ này | Làm Bước 3.3, **mở cửa sổ PowerShell mới**, chạy lại |
| Lỗi về khóa mã hóa/JWT không hợp lệ | Khóa không phải base64 đúng độ dài | Sinh lại bằng 3.1 (chỉ khi database chưa có dữ liệu cần giữ) |
| `The TCP/IP connection to the host localhost, port 1433 has failed` | TCP/IP chưa bật hoặc sai cổng | Làm lại Bước 2.2; sửa cổng trong `DB_URL` |
| `Login failed for user ...` | Sai tài khoản/mật khẩu hoặc chưa bật chế độ hỗn hợp | Làm lại Bước 2.5 B |
| `Unable to load authentication DLL mssql-jdbc_auth` | Dùng `integratedSecurity=true` mà Java không thấy DLL | Đặt `$env:JAVA_TOOL_OPTIONS='-Djava.library.path=<thư mục chứa DLL>'` rồi chạy lại, hoặc chuyển sang SQL Login (2.5 B) |
| `PKIX path building failed` / lỗi chứng chỉ | Thiếu cờ tin cậy chứng chỉ | Thêm `trustServerCertificate=true` vào `DB_URL` |
| Flyway báo `Validate failed` / checksum / lỗi migration | Database đã bị sửa tay hoặc là bản cũ lệch phiên bản | **Không** tự repair/xóa. Dùng database mới tên khác (2.4) |
| Cổng 8080 đã bị dùng | Chương trình khác chiếm cổng | Đóng chương trình đó hoặc chạy thêm `--server.port=8081` và đặt `API_PROXY_TARGET` cho FE |
| FE hiện lỗi mạng / 502 / `ECONNREFUSED` | Backend chưa chạy hoặc sai `API_PROXY_TARGET` | Kiểm tra `Invoke-RestMethod http://localhost:8080/api/v1/system/ping` |
| `db-check` trả 404 | Quên profile `dev` | Chạy lại với `"-Dspring-boot.run.profiles=dev"` |
| Đăng nhập tài khoản seed bị từ chối | Chưa thay `REPLACE_WITH_BCRYPT_HASH`, hoặc gõ khác mật khẩu | Làm lại Bước 8 |
| `npm ci` báo lỗi phiên bản Node | Node cũ | Cài Node 20+ (khuyến nghị 24.x) rồi chạy lại |

## Phụ lục: xem giao diện khi chưa có Backend/DB
Chỉ để xem màn hình, **không** chứng minh kết nối DB:

```powershell
# Cửa sổ 1 (tại thư mục gốc dự án)
node scripts\testing\api-contract-fixture.mjs
# Cửa sổ 2
cd frontend
$env:API_PROXY_TARGET = 'http://127.0.0.1:18178'
npm.cmd run dev
```
Đăng nhập fixture: `demo@example.test` / `SyntheticPass123`. Dữ liệu nằm trong bộ nhớ và mất khi khởi động lại.
