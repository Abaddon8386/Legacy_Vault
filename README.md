# Legacy_Vault

Repo nhóm: https://github.com/Abaddon8386/Legacy_Vault. Nhánh tích hợp: `develop`; nhánh nền: `main`.

## Bộ khung

React/Vite, Java 25, Spring Boot 4.1.1, Spring Data JPA, Spring Security và Microsoft SQL Server (JDBC 13.6.0.jre11). Phiên bản được giữ theo bản nền repo cũ; không nâng dependency trong lần khởi tạo này.

```text
frontend/   React/Vite, màn hình FE PS-1–8, API client, kiểm thử
backend/    Spring Boot starter, Maven Wrapper, context test
database/   Chỗ dành cho schema/migration/seed khi đưa lại ticket DB
docs/       Đối chiếu bản nền và bằng chứng kiểm tra
scripts/    Script hỗ trợ và API fixture kiểm thử FE
```

Tại mốc `ad9eea5` ngày 14/10/2026, FE PS-1–8 đã được tích hợp vào develop. Backend vẫn là bộ khung, chưa có API nghiệp vụ hay schema/migration/seed DB trên mốc này. Lịch sử khởi tạo được ghi tại [đối chiếu bản nền](docs/BASELINE.md).

## Ảnh giao diện FE PS-1–8

[Xem thư viện ảnh và đối chiếu ticket → PR](docs/screenshots/README.md).

Ảnh chụp ngày **14/10/2026**, từ develop tại `ad9eea5`, dùng **API mô phỏng và dữ liệu tổng hợp**. Đây là ảnh giao diện, chưa chứng minh tích hợp BE/SQL Server thật.

| PS-1 — Đăng ký | PS-2 — Đăng nhập |
| --- | --- |
| [![PS-1](docs/screenshots/ps-1-register.jpg)](docs/screenshots/ps-1-register.jpg) | [![PS-2](docs/screenshots/ps-2-login.jpg)](docs/screenshots/ps-2-login.jpg) |
| PS-3 — Kho di sản | PS-4 — Giám sát hoạt động |
| [![PS-3](docs/screenshots/ps-3-vault.jpg)](docs/screenshots/ps-3-vault.jpg) | [![PS-4](docs/screenshots/ps-4-dms.jpg)](docs/screenshots/ps-4-dms.jpg) |
| PS-5 — Danh mục tài sản | PS-6 — Xem tài sản |
| [![PS-5](docs/screenshots/ps-5-assets.jpg)](docs/screenshots/ps-5-assets.jpg) | [![PS-6](docs/screenshots/ps-6-detail.jpg)](docs/screenshots/ps-6-detail.jpg) |
| PS-7 — Tải bản di chúc | PS-8 — Người giám hộ và thụ hưởng |
| [![PS-7](docs/screenshots/ps-7-will-upload.jpg)](docs/screenshots/ps-7-will-upload.jpg) | [![PS-8](docs/screenshots/ps-8-beneficiaries.jpg)](docs/screenshots/ps-8-beneficiaries.jpg) |

## Chuẩn bị

- Git, JDK 25; `JAVA_HOME` trỏ đến JDK 25.
- Node/npm tương thích lockfile. Môi trường kiểm tra: Node 24.18.0, npm 11.16.0.
- SQL Server và công cụ quản lý như SSMS. Xác định server, cổng, database, phương thức xác thực và quyền trên môi trường của từng người.
- Internet để tải dependency. Backend có Maven Wrapper nên không bắt buộc cài Maven riêng.

```powershell
git clone --branch develop https://github.com/Abaddon8386/Legacy_Vault.git
cd Legacy_Vault
git switch -c feature/PS-<so>-<mo-ta>
java -version
node --version
npm.cmd --version
```

Mỗi ticket dùng nhánh riêng từ develop mới nhất, PR vào develop. Mỗi thành viên kiểm tra `git config user.name` và `git config user.email` trước khi tự commit. Không push trực tiếp vào develop.

## Chạy frontend

Trong terminal tại repo:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Mở URL do Vite in ra (thường http://localhost:5173). Kiểm tra bằng `npm.cmd run lint` và `npm.cmd run build`. Dừng bằng Ctrl+C.

## Chuẩn bị database

`database/` chưa có schema nghiệp vụ. Nếu cần chạy context trên DB thử nghiệm riêng, tạo DB trống bằng SSMS sau khi xác minh đúng instance:

```sql
IF DB_ID(N'LegacyVault') IS NULL
    EXEC(N'CREATE DATABASE [LegacyVault]');
GO
```

Không chạy trên DB production. `ddl-auto: none` nên backend không tự tạo hoặc sửa bảng. Schema, migration, seed và lựa chọn môi trường DB được đưa lại theo ticket riêng.

## Chạy backend

Trong terminal khác tại repo, đặt URL phù hợp với SQL Server của mình. Ví dụ Windows Authentication cho môi trường local đã cấu hình TCP 1433:

```powershell
cd backend
$env:SPRING_DATASOURCE_URL = 'jdbc:sqlserver://localhost:1433;databaseName=LegacyVault;encrypt=true;trustServerCertificate=true;integratedSecurity=true'
.\mvnw.cmd -version
.\mvnw.cmd spring-boot:run
```

Ví dụ localhost/1433 không xác nhận instance trên máy đã chạy. Windows Authentication cần DLL JDBC đúng phiên bản/kiến trúc trong PATH của terminal Java. Không đưa DLL hay thông tin đăng nhập vào Git. Nếu môi trường dùng SQL Authentication, đặt thêm `SPRING_DATASOURCE_USERNAME` và `SPRING_DATASOURCE_PASSWORD` ngoài repo theo cấu hình đã được nhóm duyệt.

Backend bắt buộc nhận `SPRING_DATASOURCE_URL`, không có địa chỉ máy cá nhân mặc định. Spring Boot không tự đọc `.env`. `trustServerCertificate=true` trong ví dụ chỉ dành cho local; môi trường triển khai cần chứng chỉ TLS phù hợp.

Khi DB đã truy cập được, chạy `.\mvnw.cmd verify`. Context test có sẵn cần cấu hình và kết nối SQL Server thật. Lệnh `mvn.cmd -DskipTests package` chỉ kiểm tra đóng gói, không chứng minh context hay DB hoạt động.

Backend mặc định cổng 8080, có Spring Security mặc định và chưa có API nghiệp vụ. HTTP 401 hoặc trang đăng nhập không chứng minh tích hợp hoàn chỉnh. FE đã có API client và Vite proxy `/api` tới `http://localhost:8080`; có thể đổi đích bằng `API_PROXY_TARGET`. Chạy hai server không đồng nghĩa FE → BE → SQL Server đã hoạt động; cần kiểm thử với API thật sau khi BE tích hợp.

## Xem FE với API mô phỏng

Dùng khi API thật chưa sẵn sàng. Tại thư mục gốc repo, chạy terminal thứ nhất:

```powershell
node scripts/testing/api-contract-fixture.mjs
```

Trong terminal thứ hai:

```powershell
cd frontend
npm.cmd ci
$env:API_PROXY_TARGET = 'http://127.0.0.1:18178'
npm.cmd run dev
```

Mở URL Vite, đăng nhập bằng tài khoản **chỉ dành cho fixture**: `demo@example.test` / `SyntheticPass123`. Khởi tạo kho, rồi thêm dữ liệu minh họa qua các màn hình. Fixture lưu trong bộ nhớ; khởi động lại sẽ mất dữ liệu. Tải lại trang cần đăng nhập lại vì phiên FE giữ trong bộ nhớ. Bộ dữ liệu ảnh được chuẩn bị riêng nên fixture mới khởi động chưa có sẵn các bản ghi trong ảnh. Dừng cả hai terminal bằng Ctrl+C.

Fixture chỉ phục vụ kiểm thử FE, không phải backend nghiệp vụ và không kết nối SQL Server.

## Bằng chứng

Kết quả kiểm tra và giới hạn được ghi tại [docs/VERIFICATION.md](docs/VERIFICATION.md). Không đánh dấu ticket Jira Done chỉ vì đã dựng lại bộ khung.
