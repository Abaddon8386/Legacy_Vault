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
| D-API-31 | PS-20 | `BeneficiaryResponse.updatedAt` | **Giữ** `updatedAt` (Beneficiary sửa được qua `PUT`). Điều kiện: migration `V4__beneficiary_updated_at.sql` (thêm `beneficiaries.updated_at NOT NULL DEFAULT SYSUTCDATETIME()`) merge **cùng PR** với code PS-20; thứ tự Flyway V3 (Trustee) trước V4 phải được giữ. Thay mục "BeneficiaryResponse bỏ `updatedAt`" ngày 2026-10-12 (khi đó DB chưa có cột). Chốt 2026-10-14 (Dương) |
| D-API-32 | PS-16 | Owner xem nội dung bảo mật của Asset | **Đảo ngược** "payload không bao giờ có trong response". Owner xem lại `payload` bằng `POST .../assets/{assetId}/reveal` sau khi nhập lại **mật khẩu đăng nhập hiện tại** (không có mã/PIN riêng). Chỉ khi Vault `ACTIVE`; sau đó 409 `VAULT_NOT_EDITABLE`. Sai mật khẩu `403 REAUTH_FAILED`; quá giới hạn `429 TOO_MANY_ATTEMPTS` (mặc định 5 lần/15 phút, cấu hình được, **chờ nhóm xác nhận**). Chốt 2026-10-14 (Dương) |
| D-API-33 | PS-17 / PS-18 | Owner mở/tải file di chúc | **Thay** "chưa có API tải xuống" của D-API-14. `POST .../wills/{willId}/versions/{version}/download` với **mật khẩu đăng nhập hiện tại**, chỉ khi Vault `ACTIVE`, response `attachment` + `no-store` + `nosniff`. BE so lại SHA-256 trước khi trả. Dùng chung giới hạn thử với D-API-32 (mặc định 5 lần/15 phút, **chờ nhóm xác nhận**). Chốt 2026-10-14 (Dương) |
| D-API-34 | PS-38 / PS-39 | Ghi nhận giấy tờ do Staff nhận | **Đề xuất, chờ nhóm xác nhận.** (1) Hai loại giấy tờ khai tử: `DEATH_CERTIFICATE`, `DEATH_REGISTRATION_EXTRACT` (suy từ LV-DEATH-002 "Giấy chứng tử / Trích lục khai tử"; chỉ `DEATH_CERTIFICATE` có trong data dictionary). (2) Chỉ Staff **đã nhận ca** mới ghi nhận; ca phải `OPEN`. (3) PS-38/39 chỉ ghi nhận, **không** đổi trạng thái Vault/ca: tiến độ hồ sơ (`DEATH_DOCS_COLLECTED`, `WILL_AND_IDS_SUBMITTED`) chưa có cột chứa, `verification_cases.status` chỉ có `OPEN`/`CANCELLED`. (4) PS-39 không bắt buộc ST-12 đã được duyệt. |
| D-API-35 | PS-40 | Đối chiếu di chúc gốc của Legal | **Đề xuất, chờ nhóm xác nhận.** (1) Legal (không phải Staff) đối chiếu, theo chỉ đạo của Dương. (2) Ba kết quả `MATCH`/`MISMATCH`/`INCONCLUSIVE`; `MISMATCH` và `INCONCLUSIVE` bắt buộc có lý do. (3) Hash do server lấy từ phiên bản đã lưu. (4) "Chặn luồng duyệt thông thường" hiểu là `approvalBlocked` cho tới khi kết quả **mới nhất** của ca là `MATCH`; chưa đối chiếu cũng chặn. (5) Chỉ ghi khi ca `OPEN` và Vault `DOCUMENT_VERIFICATION`. (6) **Đã giải quyết theo Main Flow ST-15:** `MATCH` đầu tiên chuyển Vault sang `WILL_VERIFICATION`. Còn mở: Legal chưa có cách xem nội dung bản scan. |
| D-API-36 | PS-41 / PS-42 / PS-43 | Hồ sơ căn cứ phân chia | **Giải quyết theo Main Flow v4.2 (ST-16..19) và D-LEGAL-002; chờ nhóm xác nhận.** (1) Hồ sơ do **Legal** tạo ở ST-16 kèm nhánh; Staff không bao giờ chọn nhánh (AC-L04). (2) "Chưa đủ thông tin" là `ON_HOLD`; hồ sơ `ON_HOLD` chưa nhận văn bản. (3) Tiến độ hồ sơ ở `legal_basis_dossiers.status`: `DRAFT` → `LEGAL_BASIS_PROVIDED` (ST-18) → `LEGAL_BASIS_FORWARDED` (ST-19). (4) ST-18 yêu cầu văn bản **được số hóa và có hash**: Staff tải file, server tính SHA-256, mã hóa, sinh `file_reference`; migration V14 thêm cột lưu file và `legal_basis_type`. (5) Mỗi ca một hồ sơ. (6) Vault: ST-15 `MATCH` → `WILL_VERIFICATION`; ST-16 → `AWAITING_LEGAL_BASIS`/`ON_HOLD`; ST-19 → `LEGAL_BASIS_VERIFICATION`. (7) Tranh chấp suy từ nhánh: NOTARIAL=`NONE`, COURT=`DISPUTED`, ON_HOLD=`UNDETERMINED`. (8) PS-43: chỉ hồ sơ `ON_HOLD` được phân loại lại sang NOTARIAL/COURT; NOTARIAL↔COURT không đổi lẫn nhau; lịch sử phân loại lưu ở `legal_basis_classification_history` (V15). (9) Văn bản NOTARIAL bắt buộc tổ chức, số và ngày công chứng. |

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
| 2026-10-14 | Dương (điều phối PS-74) | Giữ quy ước `roles` trong response **không** tiền tố `ROLE_` (conventions.md §6). `auth-role-compatibility.md` đổi thành ghi chú độ lệch: BE trên develop đang trả `ROLE_*` ở register/login/me và phải sửa (chủ PS-9/PS-10); FE chấp nhận cả hai dạng chỉ là lớp tương thích tạm thời |
| 2026-10-14 | Dương (điều phối PS-74) | D-API-31: giữ `updatedAt` trong `BeneficiaryResponse` (đã có trong beneficiaries.md và openapi.yaml); thay cho việc bỏ trường này ngày 2026-10-12, vì PS-20 đã có migration V4 thêm cột `updated_at` |
| 2026-10-14 | Dương | D-API-32: Owner xem nội dung bảo mật của Asset bằng cách nhập lại mật khẩu đăng nhập hiện tại (`POST .../assets/{assetId}/reveal`). Thay quy tắc "payload write-only, không có API xem" trong assets.md/openapi.yaml; giới hạn thử 5 lần/15 phút là đề xuất chờ nhóm xác nhận |
| 2026-10-14 | Dương | D-API-33: Owner mở/tải nội dung file di chúc sau khi nhập lại mật khẩu (`POST .../versions/{version}/download`). Thay quy tắc "chưa có API tải/xem nội dung file" trong D-API-14 và wills.md |
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

## G. PS-77 — đề xuất chờ phê duyệt của nhóm (2026-10-17)

Trạng thái: **PENDING — chưa có biên bản phê duyệt của nhóm**. Trao đổi với người dùng
trong chat là đầu vào đề xuất, không thay thế Main Flow v4.2, D-TRUSTEE-001 hoặc D-LEGAL-002.
Không ghi tên thành viên hoặc chữ ký phê duyệt khi chưa có xác nhận thực tế.

- Đề xuất mô hình: chọn sau đăng ký, trọn đời, nâng hạn mức, không hạ/gia hạn/hết hạn.
- Đề xuất giá một lần: BASIC 0, STANDARD 199000, EXTENDED 499000 VND.
- Đề xuất Owner quota: 5/50/200 Asset, 100 MiB/1 GiB/5 GiB, 10 MiB/tệp.
- Đề xuất evidence theo ca: 100 MiB tổng, 50 phiên bản, 10 MiB/tệp. **Không áp dụng vào PS-41**.
- Còn phải chốt: ai xác nhận thanh toán/cấp gói, chứng từ/giao dịch nào được tin cậy,
  idempotency và rollback, nâng gói trả chênh lệch hay cách khác; có cho mô phỏng miễn phí không.
  Owner yêu cầu nâng gói không đồng nghĩa đã thanh toán hoặc được cấp entitlement.
- Nhóm cần bổ sung biên bản, người duyệt, ngày duyệt và tham chiếu tài liệu nguồn trước khi
  kích hoạt quota; cần triển khai quy trình thanh toán/xác nhận đã duyệt trước khi cho cấp gói.

Hành vi hiện tại: `POST /subscriptions/me/upgrade` luôn 409
`SUBSCRIPTION_UPGRADE_UNAVAILABLE`, không ghi entitlement/audit nâng gói; không có cờ bật cấp miễn phí.
`legacyvault.subscription.quota-enforcement-enabled=false` mặc định: không áp các giới hạn Owner
đề xuất, GET catalog/gói trả 409 `SUBSCRIPTION_POLICY_PENDING`. Cờ chỉ dành cho thử nghiệm cô lập
cho đến khi có phê duyệt bằng văn bản; bật cờ không mở khóa cấp gói trả phí.
Intake PS-41 không phụ thuộc subscription và không chặn theo tổng byte/số phiên bản đề xuất.
Giới hạn upload và authorization/route/hold đã có của PS-41 được giữ nguyên.
Quy tắc một Vault/Owner đã chốt tại A4 tiếp tục có hiệu lực.
