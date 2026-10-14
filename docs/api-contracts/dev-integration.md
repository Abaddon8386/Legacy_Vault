# Tích hợp môi trường dev: React ↔ Backend ↔ SQL Server

## 1. Địa chỉ đã chọn (xem D-API-01..03)

| Thành phần | URL | Ghi chú |
|---|---|---|
| Backend (Spring Boot) | `http://localhost:8080` | đổi bằng biến `SERVER_PORT` |
| Frontend (Vite) | `http://localhost:5173` | `npm run dev` |
| API base | `/api/v1` | FE gọi **đường dẫn tương đối**, ví dụ `/api/v1/system/ping` |
| Swagger/OpenAPI | `docs/api-contracts/openapi.yaml` | xem bằng editor.swagger.io hoặc VS Code extension |

```
Trình duyệt ──► Vite :5173 ──(proxy /api)──► Spring Boot :8080 ──► SQL Server
```

## 2. Cách FE gọi BE: Vite proxy (chọn làm chính)

`frontend/vite.config.js` chuyển tiếp mọi request `/api/**` sang `http://localhost:8080`. Trình duyệt chỉ thấy một origin
nên **không cần CORS** khi dev. Code FE dùng `frontend/src/api/http.js` (base `VITE_API_BASE_URL`, mặc định `/api/v1`).

> **Cấm đặt secret trong biến `VITE_*`** — chúng được nhúng vào JavaScript gửi tới trình duyệt. Chỉ để giá trị công khai
> như base URL. File mẫu: `frontend/.env.example`.

### Phương án phụ: CORS giới hạn origin

Chỉ dùng khi FE gọi thẳng `http://localhost:8080`. Mặc định **tắt** (danh sách origin rỗng). Bật bằng biến môi trường:

```powershell
$env:CORS_ALLOWED_ORIGINS = 'http://localhost:5173'
```

Chỉ origin trong danh sách được chấp nhận, không dùng `*`. Được cho phép: `GET POST PUT PATCH DELETE OPTIONS`; header
`Authorization, Content-Type, Accept, Accept-Language`; lộ ra `X-Trace-Id`. `allowCredentials` đang **tắt**; nếu sau này
dùng refresh token bằng cookie (D-API-05) phải bật kèm origin cụ thể.

## 3. Chạy hệ thống

Cần: JDK 25, Node (theo `frontend/package.json`), SQL Server đang chạy, database `LegacyVault` (xem README repo / PS-73).

```powershell
# Terminal 1 — Backend (profile dev để có /system/db-check)
cd backend
$env:DB_URL = 'jdbc:sqlserver://localhost:1433;databaseName=LegacyVault;encrypt=true;trustServerCertificate=true;integratedSecurity=true'
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=dev"

# Terminal 2 — Frontend
cd frontend
npm ci
npm run dev
```

- Điều chỉnh server/cổng/instance theo máy bạn. Với SQL login thay vì Windows Authentication, cấu hình URL/tài khoản trong
  **terminal hiện tại** theo hướng dẫn PS-73 và bỏ `integratedSecurity=true`.
  **Không** ghi mật khẩu vào file được commit.
- `integratedSecurity=true` cần DLL xác thực native của Microsoft JDBC trong `PATH` (xem README repo, mục 3).
- Spring Boot không tự đọc file `.env`. Biến môi trường chỉ có hiệu lực trong terminal đang mở.
- `trustServerCertificate=true` chỉ dành cho local.

## 4. Bằng chứng tích hợp (evidence) cần có trong PR

1. Backend khởi động, log không lỗi kết nối DB.
2. `http://localhost:5173` hiển thị khối **"Trạng thái hệ thống (dev)"**: `ping` → `{"status":"UP"...}` và `db-check` → `{"database":"UP"}`.
3. DevTools → Network: request tới `/api/v1/system/ping` trạng thái 200.
4. Một phản hồi 401 từ endpoint riêng tư với JSON lỗi chung (`code: UNAUTHENTICATED`, có `traceId`).
5. Kết quả `.\mvnw.cmd verify` và `npm run lint && npm run build`.

Lưu ảnh/log vào `docs/evidence/` (che thông tin nhạy cảm; không chứa token/mật khẩu). Ghi lại commit, ngày, máy, kết quả.

## 5. Lỗi thường gặp

| Triệu chứng | Nguyên nhân & cách xử lý |
|---|---|
| FE hiện `db-check: lỗi NETWORK_ERROR` | Backend chưa chạy hoặc sai cổng 8080 |
| FE hiện `db-check: lỗi RESOURCE_NOT_FOUND` | Backend không chạy profile `dev` |
| `db-check` trả `DOWN` | DB không tới được: kiểm tra service, TCP/IP, cổng, quyền, DLL xác thực; xem log server theo `traceId` |
| `contextLoads` lỗi khi `verify` | Test này khởi tạo toàn bộ context nên cần SQL Server truy cập được; đặt `DB_URL` trước khi chạy |
| Gọi thẳng :8080 từ trình duyệt bị chặn CORS | Dùng proxy (gọi qua :5173) hoặc đặt `CORS_ALLOWED_ORIGINS` |
| 401 mọi lúc ở endpoint nghiệp vụ | Bình thường nếu chưa đăng nhập; token xử lý ở PS-10/11 |
