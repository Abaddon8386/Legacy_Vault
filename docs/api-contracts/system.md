# System — smoke test (PS-74)

Đã **triển khai thật** trong `backend/.../system/`. Dùng để xác nhận app chạy và (dev) DB kết nối được.

## GET /api/v1/system/ping

- **Quyền:** công khai. **Ownership:** không.
- **Response 200:**
  ```json
  { "status": "UP", "service": "legacyvault-backend", "time": "2026-10-08T10:00:00Z" }
  ```
- Tối giản có chủ đích: không phiên bản thư viện, không hostname, không thông tin DB.
- **Lỗi:** `405 METHOD_NOT_ALLOWED` nếu không phải `GET`.

## GET /api/v1/system/db-check

- **Môi trường:** chỉ tồn tại khi backend chạy profile `dev` (`-Dspring-boot.run.profiles=dev`). Profile khác → `404 RESOURCE_NOT_FOUND`.
- **Quyền:** công khai (chỉ trả `UP/DOWN`). **[D-API-11]**
- **Cách kiểm tra:** truy vấn chỉ đọc `SELECT 1`. Không đọc/ghi bảng nghiệp vụ.
- **Response 200:**
  ```json
  { "database": "UP" }
  ```
  ```json
  { "database": "DOWN" }
  ```
- DB lỗi **vẫn trả 200** với `DOWN` để endpoint là công cụ chẩn đoán; **không** trả thông báo lỗi SQL, host, user, tên database.
  Loại lỗi được ghi vào log server (không ghi message).

## Kiểm tra bằng dòng lệnh (PowerShell)

```powershell
Invoke-RestMethod http://localhost:8080/api/v1/system/ping
Invoke-RestMethod http://localhost:8080/api/v1/system/db-check      # chỉ khi profile dev
Invoke-RestMethod http://localhost:5173/api/v1/system/ping          # qua Vite proxy
```

Kiểm tra DB thủ công bằng truy vấn chỉ đọc (SSMS / sqlcmd): `SELECT 1;` hoặc `SELECT DB_NAME();` — không chạy lệnh ghi
khi chỉ kiểm tra kết nối.

## Test bám contract

`ErrorContractTest.ping_isPublicAndReturnsUp`, `DbCheckControllerTest` (UP/DOWN + không lộ lỗi SQL),
`DbCheckDisabledOutsideDevTest` (404 ngoài profile dev).
