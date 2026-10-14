# Legacy_Vault

Repo nhóm: https://github.com/Abaddon8386/Legacy_Vault. Nhánh tích hợp: `develop`; nhánh nền: `main`.

## Bộ khung

React/Vite, Java 25, Spring Boot 4.1.1, Spring Data JPA, Spring Security và Microsoft SQL Server (JDBC 13.6.0.jre11). Phiên bản được giữ theo bản nền repo cũ; không nâng dependency trong lần khởi tạo này.

```text
frontend/   React/Vite, màn hình FE PS-1–8, API client, kiểm thử
backend/    Spring Boot, nền bảo mật và controller xác thực
database/   Migration và seed SQL Server PS-73
docs/       Đối chiếu bản nền và bằng chứng kiểm tra
scripts/    Script hỗ trợ và API fixture kiểm thử FE
```

FE PS-1–8 đã tích hợp vào develop. Ngày 14/10/2026, develop tiếp tục nhận PR #21 (PS-9), gồm nền DB PS-73 và code xác thực. Ảnh bên dưới giữ mốc FE `ad9eea5`; việc có code BE/DB chưa chứng minh kết nối thực tế đã chạy. Lịch sử khởi tạo được ghi tại [đối chiếu bản nền](docs/BASELINE.md).

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

## Database và backend

Đọc [hướng dẫn thiết lập PS-73](docs/database/PS73_Database_Setup_Guide_v5.md) và [hướng dẫn xác minh/seed](docs/database/Database_Verification_and_Seed_Guide.md) trước khi chạy backend. Chọn đúng SQL Server/database của môi trường nhóm; không lấy cấu hình máy cá nhân làm mặc định chung.

Cấu hình BE tại develop `af55c46` yêu cầu `DB_URL` và `JWT_SECRET_BASE64` ngoài Git; Flyway đã bật, Hibernate dùng `ddl-auto: none`. Xác minh cấu hình thực tế và bí mật được cung cấp trước khi chạy. Không commit mật khẩu, token hoặc file `.env` thật. Backend có Maven Wrapper; chạy và kiểm thử theo tài liệu PS-73 trên DB thử nghiệm phù hợp.

FE dùng API client và Vite proxy `/api` tới `http://localhost:8080`, đổi đích bằng `API_PROXY_TARGET`. Code xác thực đã xuất hiện trong PR #21; cần kiểm thử API thực tế và luồng FE → BE → SQL Server để xác nhận tích hợp. Bộ ảnh dưới đây chỉ sử dụng API mô phỏng.

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
