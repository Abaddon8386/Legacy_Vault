# Quyết định API (Decision Log)

> **Cách đọc:** mục **ĐÃ CHỐT** là quyết định để FE/BE triển khai Sprint 1, do **Dương (điều phối PS-74) chốt ngày 2026-10-11**
> trên cơ sở đề xuất trong contract. FE/BE vẫn có thể phản biện ở buổi review; mọi thay đổi sau đó phải ghi vào mục D và cập nhật
> contract + `openapi.yaml` trong cùng PR.
>
> Các mục thuộc **người khác quyết** (giảng viên, Long/PS-73, nhóm trưởng) **không** được chốt ở đây — xem mục C và F.

## A. Nền tảng (ảnh hưởng mọi endpoint)

| ID | Vấn đề | Quyết định | Hệ quả |
|---|---|---|---|
| D-API-01 | Base path | `/api/v1` | URL toàn hệ thống |
| D-API-02 | Port local | Backend `8080`, Frontend `5173` | Proxy/CORS |
| D-API-03 | FE gọi BE khi dev | **Vite proxy** là cách chính; CORS whitelist `http://localhost:5173` là phương án phụ, mặc định **tắt** (`CORS_ALLOWED_ORIGINS`) | `vite.config.js`, `SecurityConfig` |
| D-API-04 | Nơi lưu access token ở FE | Trong bộ nhớ JS (in-memory); tải lại trang phải đăng nhập lại. **Không** dùng `localStorage`/`sessionStorage` | FE guard |
| D-API-05 | Refresh token | **Không có** ở Sprint 1 (không có `/auth/refresh`). Nếu sau này thêm: cookie `HttpOnly; Secure; SameSite` + bật chống CSRF cho endpoint đó | PS-10 |
| D-API-06 | Phân trang | `page` (từ 0), `size` (mặc định 20, tối đa 100), `sort`; envelope `content/page/size/totalElements/totalPages` | Mọi endpoint danh sách |
| D-API-07 | Truy cập tài nguyên của người khác | `404 RESOURCE_NOT_FOUND` (không lộ sự tồn tại); thiếu role → `403 ACCESS_DENIED` | Test ownership |
| D-API-08 | Kiểu ID công khai | API chỉ dùng **UUID**; khóa chính `BIGINT IDENTITY` là nội bộ, không lộ ra API; DB có cột UUID công khai riêng | Schema + DTO (xem F) |
| D-API-09 | Thời gian | ISO-8601 UTC có `Z` | DTO |
| D-API-10 | Đặt tên | JSON `camelCase`; enum `UPPER_SNAKE_CASE` | DTO |
| D-API-11 | Endpoint chẩn đoán DB | `GET /system/db-check` chỉ tồn tại ở profile `dev`, công khai, chỉ trả `UP/DOWN` | `SecurityConfig` |
| D-API-19 | HTTP status cho vi phạm quy tắc nghiệp vụ | `422`; xung đột trạng thái `409` | Bảng mã lỗi |
| D-API-21 | JWT | Access token ngắn hạn; thời hạn cấu hình qua property, mặc định 3600 giây; claim tối thiểu `sub` (userId), `roles` | PS-10/11 |
| D-API-22 | Chống dò mật khẩu (rate limit/khóa tạm) | **Ngoài phạm vi Sprint 1**; ghi nhận là rủi ro | PS-10 |

## B. Nghiệp vụ theo ticket

| ID | Ticket | Vấn đề | Quyết định |
|---|---|---|---|
| D-API-12 | PS-12 / PS-21 | Vault mới `ACTIVE` hay `DRAFT` | **`ACTIVE`** (đúng AC của PS-12 và ST-02). Mức "sẵn sàng cấu hình" tính qua `configuration-check`, không dùng `DRAFT`. *Ghi nhận cho nhóm trưởng:* ma trận trạng thái trong Main Flow ghi `DRAFT → ACTIVE`, cần đồng bộ tài liệu |
| D-API-13 | PS-15 | Asset loại `FILE` | Sprint 1 chỉ `TEXT`, `CREDENTIAL` qua JSON; upload `FILE` để sprint sau |
| D-API-14 | PS-17 | File di chúc số hóa | PDF/JPEG/PNG, tối đa 10 MB (cấu hình được); chưa có API tải xuống |
| D-API-15 | PS-22 / PS-23 | Khoảng `checkIntervalDays`, độ dài Grace Period, chu kỳ quét | `checkIntervalDays` và chu kỳ quét: **cấu hình qua property, không hardcode**. Grace Period: **mặc định 1 ngày** (nhóm chốt 2026-10-12, xem A5) |
| D-API-16 | PS-9 | Xác minh email khi đăng ký | Sprint 1: tài khoản `ACTIVE` ngay, không xác minh email |
| D-API-17 | PS-9 | Mật khẩu | 8–72 ký tự (giới hạn BCrypt), không bắt buộc ký tự đặc biệt |
| D-API-18 | PS-19 | URL Trustee | `/api/v1/trustees` (đúng D-TRUSTEE-001), `vaultId` trong body/query, không lồng dưới `/vaults` |
| D-API-20 | PS-13 | API đọc audit | Không có trong Sprint 1 |
| D-API-23 | PS-11 / PS-14 | `GET /auth/me`, `GET /vaults` | **Có cả hai** |
| D-API-24 | PS-16 | Cập nhật Asset | `PATCH` (cập nhật một phần) |
| D-API-25 | PS-21 | Kiểm tra điều kiện Beneficiary | `GET /vaults/{id}/configuration-check` + bật DMS bị chặn bằng `422 BENEFICIARY_REQUIRED` |
| D-API-26 | PS-20 | Số định danh Beneficiary | Có thể lưu (write-only `identityNumber`, mã hóa trong DB); **response không trả số, chỉ trả `hasIdentityNumber` (boolean)**. Không cần giải mã khi liệt kê. *(Đổi so với đề xuất ban đầu `identityNumberMasked`.)* |
| D-API-27 | PS-22 | Check-in khi DMS đã `TRIGGERED` | Sprint 1: từ chối `409 DMS_NOT_MONITORING`. Luồng huỷ báo động (LV-OWN-001) là việc riêng ở sprint sau |
| D-API-28 | PS-23 | Nhiều instance cùng quét | Cập nhật có điều kiện `WHERE status = 'MONITORING'` để idempotent; chưa thêm thư viện lock |
| D-API-29 | PS-15 | Giới hạn `payload` Asset | Mặc định 64 KB, cấu hình qua property; vượt → `400 VALIDATION_FAILED` |
| D-API-30 | PS-22 / PS-23 | Phạm vi và đường dẫn DMS | DMS thuộc **tài khoản Owner** (mỗi Owner một DMS, `dms_configs.owner_user_id UNIQUE`), đường dẫn `/api/v1/dms`, `/api/v1/dms/check-in`; không có tham số `vaultId`/`ownerId`, Owner lấy từ người đăng nhập. Chốt 2026-10-14 (Dương) |

## C. Câu hỏi mở kế thừa từ tài liệu nghiệp vụ — **TẠM HOÃN** (2026-10-12)

Các mục này nằm ngoài thẩm quyền của nhóm Backend (cần giảng viên hoặc quyết định nghiệp vụ). Nhóm quyết định **tạm bỏ qua**, không chặn
Sprint 1. Khi code chạm tới, dùng tham số cấu hình và `TODO(open-question)`, không tự đặt giá trị.

| # | Câu hỏi | Trạng thái |
|---|---|---|
| C1 | Cách thể hiện tài sản số phi tập trung (ví Web3/private key) trong văn bản căn cứ phân chia | Hoãn — chờ giảng viên |
| C2 | Thời hạn chờ khi nhóm Beneficiary không thống nhất được Trustee | Hoãn |
| C3 | Số lần/kênh liên hệ Trustee và thời gian chờ trước khi tìm người thay thế | Hoãn |
| C4 | Chuẩn chữ ký số của Legal Verifier (hiện RSA mô phỏng `SIMULATION ONLY`) | Hoãn |
| C5 | Độ dài Grace Period | **Đã xử lý** — mặc định 1 ngày (A5) |

## D. Nhật ký thay đổi & biên bản review

| Ngày | Người | Nội dung |
|---|---|---|
| 2026-10-11 | Dương | Chốt D-API-01..29 theo đề xuất; D-API-26 đổi sang `hasIdentityNumber` |
| 2026-10-12 | Dương (theo quyết định của nhóm) | B4: đổi tên trường trong D-LEGAL-002 thành `legal_basis_type`; A4: xác nhận một Vault/Owner; A5: Grace mặc định 1 ngày; N3: giữ V2; N4 và C1–C4: tạm bỏ qua |
| 2026-10-12 | Dương | Contract khớp DB: `TrusteeResponse` bỏ `note`, `createdAt`, `updatedAt` (thêm `appointedAt`, `revokedAt`); `DmsResponse` thuộc tính đầu là `ownerId` (thêm `gracePeriodDays`, `updatedAt`); `BeneficiaryResponse` bỏ `updatedAt`; DMS đổi đường dẫn từ `/vaults/{vaultId}/dms` sang `/api/v1/dms` (DMS thuộc Owner) |
| 2026-10-14 | Dương (điều phối PS-74) | **Chốt lại D-API-30:** DMS thuộc tài khoản Owner, đường dẫn `/api/v1/dms`. Hủy thay đổi sang `/api/v1/vaults/{vaultId}/dms` có trong nhánh foundation/PS-22/PS-23 (thay đổi đó không được ghi vào nhật ký này). Khôi phục `dms.md`, `DmsResponse` (`ownerId`, `gracePeriodDays`, `updatedAt`), dòng `/dms/**` trong auth.md. Code PS-22/PS-23 cần sửa theo contract này |
| _điền sau_ | Dương, Long, Ân, Thái, Huy | Biên bản buổi review contract FE/BE |

## E. Đã thống nhất với PS-73 (database) — 2026-10-11

Theo trao đổi Dương – Long. **Xác minh trên commit `842258c` của `feature/PS-73-database-setup`** (đọc V2, seed, pom, yaml và tài liệu
`docs/database/`; **chưa chạy migration trên SQL Server**).

| Mã | Nội dung | Trạng thái |
|---|---|---|
| B1 | `BIGINT` nội bộ + cột UUID công khai `public_id` | **Đã có** trong V2 (10 bảng), kèm `DEFAULT NEWID()` |
| B2 | `beneficiaries.date_of_birth`, `relationship` | **Đã có** trong V2 (`date_of_birth`, `relationship_to_owner`; contract ánh xạ `relationship` ↔ `relationship_to_owner`) |
| B3 | Di chúc = `assets` (DOCUMENT) + `asset_versions` + `legal_documents` | Đã chốt (xem wills.md) |
| B4 | Tránh trùng tên `document_type` | **Đã chốt 2026-10-12:** giữ cột DB `legal_documents.document_type`; đổi trường trong D-LEGAL-002 thành `legal_basis_type` (không cần Long đổi DB) |
| B5 | `asset_allocations` là kế hoạch phân bổ chờ Legal duyệt | Đã chốt; chưa thấy ghi chú trong tài liệu DB |
| B6 | Mã role `ROLE_BENEFICIARY` | Đã chốt |

## F. Các mục đã phát sinh từ review PS-73

| ID | Vấn đề | Trạng thái (theo `842258c`) |
|---|---|---|
| A1 | `users.deleted_at` | **Đã giải quyết** (V2) |
| A2 | Trustee giữ lịch sử | **Đã giải quyết** — bỏ `UNIQUE (vault_id)`, thêm filtered unique index `UX_trustees_vault_active` (`status = 'APPOINTED'`) |
| A3 | `trustees.phone_number` | **Đã giải quyết** — nullable + `CHECK (phone_number IS NOT NULL OR email IS NOT NULL)` |
| A4 | Mỗi Owner một Vault | **Đã chốt** — nhóm xác nhận 2026-10-12. Tạo Vault thứ hai trả `409 VAULT_ALREADY_EXISTS` |
| A5 | `grace_period_days` | **Đã chốt** — mặc định 1 ngày (nhóm, 2026-10-12), khớp `DEFAULT 1` trong V2. *Ghi nhận rủi ro:* 1 ngày là rất ngắn so với mục đích DMS; nếu cần đổi sau này phải qua migration V3 |
| A6 | V1 hay V2 | **Đã giải quyết** — thêm V2 |
| N1 | Seed thiếu `public_id` | **Đã giải quyết** — V2 thêm `DEFAULT NEWID()` |
| N2 | `flyway.locations` phụ thuộc working directory | **Đã giải quyết** — migration được đóng gói vào classpath (`classpath:db/migration`, Maven resource `../database/migration`) |
| N3 | V2 bị sửa tại chỗ sau khi đã push (`804b891` → `842258c`) | **Đã chốt: giữ V2** (2026-10-12). Điều kiện: báo mọi người đã chạy bản V2 cũ **reset DB cục bộ** (nếu không sẽ lỗi Flyway "checksum mismatch"); từ khi merge, mọi thay đổi schema là V3 trở đi |
| N4 | Tài liệu DB chưa nhắc DLL xác thực Windows (`mssql-jdbc_auth-*.dll`) và chưa có cách sinh BCrypt cho seed | **Tạm bỏ qua** (2026-10-12) |
