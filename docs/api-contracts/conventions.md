# Quy ước chung (DTO · Validation · URL · i18n)

Các quyết định nền tảng đã chốt, xem [open-decisions.md](open-decisions.md) (D-API-01..11).

## 1. URL & HTTP

- Base path: `/api/v1`. Local: backend `http://localhost:8080`, frontend `http://localhost:5173` (gọi qua proxy, xem [dev-integration.md](dev-integration.md)).
- Tên tài nguyên là danh từ số nhiều, chữ thường, gạch ngang: `/vaults`, `/vaults/{vaultId}/assets`.
- Hành động không phải CRUD dùng `POST .../{id}/<hành-động>` (ví dụ `/dms/check-in`, `/trustees/{id}/revoke`).
- `GET` không thay đổi dữ liệu. `POST` tạo mới trả `201` + header `Location`. Cập nhật toàn phần `PUT`, một phần `PATCH`.
- Mọi request/response JSON dùng `Content-Type: application/json; charset=UTF-8`, trừ upload (`multipart/form-data`).

## 2. Đặt tên & kiểu dữ liệu (D-API-08..10)

| Mục | Quy ước |
|---|---|
| Tên trường JSON | `camelCase` |
| Enum | chuỗi `UPPER_SNAKE_CASE` (`ACTIVE`, `NOTARIAL`) |
| ID công khai | UUID dạng chuỗi (`"3f2b8c1e-..."`) — **đã chốt** (D-API-08). Khóa chính `BIGINT IDENTITY` của DB chỉ dùng nội bộ, không xuất hiện trong URL/JSON; DB có cột UUID công khai riêng |
| Thời gian | ISO-8601 UTC có hậu tố `Z` (`2026-10-08T10:00:00Z`) |
| Số tiền/số lớn | không dùng trong Sprint 1 |
| Trường rỗng | trả `null` hoặc bỏ qua; mảng rỗng luôn là `[]` |
| Boolean | `true`/`false`, không dùng `"Y"/"N"` |

## 3. DTO

- Mỗi endpoint có DTO request/response riêng (Java `record`), ví dụ `RegisterRequest`, `RegisterResponse`.
  **Không** trả Entity; **không** dùng Entity làm request.
- Request **không** chứa trường do server quyết định: `ownerId`, `status`, `createdAt`, `id`, `role`. Trường thừa bị bỏ qua.
- Response **không** chứa: `passwordHash`, payload tài sản (plaintext hay ciphertext), khóa mã hóa, ID nội bộ DB.
- Tách lớp: `Controller` (HTTP) → `Service` (nghiệp vụ, ném `BusinessException`) → `Repository` (DB). Entity không rời khỏi Service.

## 4. Validation

- Dùng Jakarta Validation trên DTO + `@Valid @RequestBody` ở controller: `@NotBlank`, `@Email`, `@Size`, `@Pattern`, `@Min/@Max`.
- Validation lỗi trả `400 VALIDATION_FAILED` kèm `errors[]` theo trường. Mỗi phần tử: `field`, `code`
  (tên ràng buộc dạng `NOT_BLANK`, `EMAIL`, `SIZE`...), `messageKey` (`validation.NotBlank`...), `message` (đã dịch).
- Ràng buộc riêng: đặt `message = "validation.<tên>"` trên annotation và thêm key vi/en; handler sẽ dùng key đó.
- Validation nghiệp vụ (trùng email, vượt quyền, sai trạng thái) **không** nằm ở DTO mà ném `BusinessException` từ Service.
- Chuẩn hóa trước khi lưu: `trim` chuỗi, email viết thường.

## 5. Phân trang & sắp xếp (D-API-06)

Query: `?page=0&size=20&sort=createdAt,desc`. `page` bắt đầu từ 0; `size` mặc định 20, tối đa 100.

```json
{ "content": [ ], "page": 0, "size": 20, "totalElements": 0, "totalPages": 0 }
```

Chỉ các endpoint trả danh sách có thể tăng trưởng mới phân trang (`GET /vaults`, `GET .../assets`). Danh sách nhỏ cố định
(beneficiaries của một Vault) trả mảng trong `content` cùng envelope để FE xử lý đồng nhất.

## 6. Xác thực & phân quyền

- Header: `Authorization: Bearer <jwt>`. Backend dùng Spring Security (principal/authorities), **không** tự giải mã JWT trong controller.
- Authority nội bộ có tiền tố `ROLE_` (`ROLE_VAULT_OWNER`); API trả `roles` **không** tiền tố (`VAULT_OWNER`).
- Đường dẫn công khai (không cần token) — danh sách duy nhất, mọi đường dẫn khác yêu cầu đăng nhập:
  `POST /auth/register`, `POST /auth/login`, `GET /system/ping`, `GET /system/db-check` (chỉ profile `dev`).
- 401 = chưa/không hợp lệ xác thực. 403 = đã xác thực nhưng thiếu role.
- **Ownership:** người đăng nhập không phải chủ của Vault → `404 RESOURCE_NOT_FOUND` (không lộ việc Vault có tồn tại) (D-API-07).
- Token ở FE: lưu trong bộ nhớ JS, không dùng `localStorage`; không có refresh token ở Sprint 1 (D-API-04/05).

## 7. i18n (vi/en)

- Ngôn ngữ lấy từ header `Accept-Language`. Hỗ trợ `vi`, `en`.
- **Fallback:** không có header, hoặc ngôn ngữ khác `vi`/`en` → dùng `vi`. Thiếu message key trong file → trả chính key.
- `message` chỉ để hiển thị. **FE phân loại lỗi bằng `code` (và `status`), không bao giờ bằng chuỗi `message`.**
- Thêm thông điệp: thêm key vào `messages.properties` (vi) và `messages_en.properties` (en) cùng lúc. Code Java gọi
  `MessageService`, không viết chữ cứng. Key theo mẫu `error.<nhóm>.<tên>` và `validation.<Ràng buộc>`.

## 8. Bảo mật khi viết code

- Không log: mật khẩu, JWT/token, payload tài sản, nội dung file di chúc, khóa mã hóa.
- Không đưa dữ liệu nhạy cảm vào `BusinessException` args hoặc message.
- Mật khẩu băm BCrypt; so sánh bằng `PasswordEncoder.matches`.
- Mọi hành động nghiệp vụ quan trọng ghi audit (xem [audit.md](audit.md)).
- Mọi trường tải lên (tên file...) phải coi là không tin cậy; không dùng làm đường dẫn lưu file.
