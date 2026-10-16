# Role trong response Auth — độ lệch tạm thời giữa BE và contract (PS-1 / PS-9 / PS-10)

## Contract (không đổi)

Theo [conventions.md §6](conventions.md) và [auth.md](auth.md):

- Authority **nội bộ** (Spring Security, bảng `roles.role_code`, claim trong JWT) có tiền tố `ROLE_`: `ROLE_VAULT_OWNER`...
- Trường `roles` trong **JSON response** của API **không** có tiền tố: `["VAULT_OWNER"]`.

| Authority nội bộ | Giá trị trong JSON `roles` |
| --- | --- |
| `ROLE_VAULT_OWNER` | `VAULT_OWNER` |
| `ROLE_STAFF_EXECUTOR` | `STAFF_EXECUTOR` |
| `ROLE_LEGAL_VERIFIER` | `LEGAL_VERIFIER` |
| `ROLE_ADMIN` | `ADMIN` |
| `ROLE_BENEFICIARY` | `BENEFICIARY` |

Áp dụng cho `RegisterResponse.roles` (`POST /auth/register`), `LoginResponse.user.roles` (`POST /auth/login`) và
`GET /auth/me`.

## Hiện trạng trên develop (`65799be`) — lệch contract

BE trả nguyên `role_code` có tiền tố (`["ROLE_VAULT_OWNER"]`) ở cả ba endpoint trên: `AuthService` dùng hằng
`ROLE_VAULT_OWNER` khi đăng ký và trả thẳng `role_code` từ DB khi đăng nhập/`/auth/me`.

**Việc cần làm ở BE (chủ PS-9/PS-10):** bỏ tiền tố `ROLE_` khi dựng `roles` cho response, giữ nguyên authority nội bộ,
giá trị trong DB và claim JWT. Test response phải kiểm `roles == ["VAULT_OWNER"]`.

## Biện pháp tạm thời ở FE (PS-1, PR #28)

Trong lúc BE chưa sửa, `readUser` ở `frontend/src/api/contracts.js` chấp nhận **cả hai** dạng (`VAULT_OWNER` và
`ROLE_VAULT_OWNER`) rồi chuẩn hóa về dạng không tiền tố như bảng trên. Role lạ hoặc mảng rỗng bị từ chối; giá trị trùng
được loại bỏ. Đăng ký, đăng nhập và tạo phiên dùng cùng một cách chuẩn hóa. Form đăng ký không gửi role, và guard ở FE
không thay thế phân quyền của BE.

Đây là **lớp tương thích tạm thời**, không phải contract: FE/BE mới **không** được dựa vào việc API trả `ROLE_*`. Sau khi
BE trả đúng contract, FE có thể bỏ nhánh chấp nhận `ROLE_*` (giữ hay bỏ do FE quyết định; giữ lại không gây sai).

Kiểm chứng hiện có: test hồi quy ở FE cho đăng ký HTTP 201, chuẩn hóa role khi đăng nhập/tạo phiên và từ chối authority
không hợp lệ. Các test này chỉ kiểm response, không chứng minh kết nối SQL Server.
