# Audit Log append-only — PS-13 (LV-AUD-001)

Trạng thái: **đối chiếu theo source `Legacy_Vault(7).zip`; hành vi runtime trên SQL Server vẫn cần được xác nhận bằng Integration Test**. Audit không có endpoint công khai trong Sprint 1 (D-API-20); các API nghiệp vụ gọi `AuditService`.

## Quy tắc

- **Append-only:** nghiệp vụ không UPDATE/DELETE bản ghi audit. Ép buộc ở **mức CSDL** (ví dụ chỉ cấp `INSERT/SELECT` cho tài khoản ứng dụng và `DENY UPDATE, DELETE`, hoặc trigger chặn) — phối hợp task database (PS-73). Không viết repository/endpoint sửa hoặc xóa, kể cả cho `ROLE_ADMIN`.
- Lưu tối thiểu 12 tháng.
- **Không ghi secret:** mật khẩu, JWT, `payload` tài sản, nội dung/byte file, khóa mã hóa, số định danh đầy đủ.
- Audit của thao tác nghiệp vụ thông thường phải nằm trong cùng transaction với thao tác đó. Nếu ghi audit thất bại, exception phải được truyền lên để thao tác nghiệp vụ rollback.

## Bản ghi tối thiểu

| Trường | Ghi chú |
|---|---|
| `id`, `occurredAt` | thời điểm UTC |
| `actorType` | `USER` \| `SYSTEM` |
| `actorId`, `actorRoles` | null với `SYSTEM` hoặc đăng nhập thất bại không xác định user |
| `action` | mã hành động (bảng dưới) |
| `entityType`, `entityId` | đối tượng bị tác động |
| `stateBefore`, `stateAfter` | nếu có chuyển trạng thái; phải là JSON hợp lệ theo schema/constraint của database |
| `traceId` | khớp `X-Trace-Id` của request |
| `context` | thông tin phụ **đã lọc** (vd: tên trường đã đổi, sha256, kích thước) |
| `stepId`, `ruleId` | nếu áp dụng (vd `ST-03`, `LV-AUD-001`) |

## Chuẩn hóa `state_before` / `state_after` — lỗi SQL Server đã phát hiện

SQL Server constraint trên bảng `audit_logs` dùng `ISJSON(...) = 1`. Vì vậy, không được lưu trực tiếp chuỗi trạng thái thuần như `ACTIVE`, `AWAITING_VERIFICATION`, `PENDING` hoặc `APPROVED` vào các cột state. Các giá trị này không phải JSON hợp lệ theo constraint.

Trong source hiện tại, `com.legacyvault.audit.AuditService.record()` gọi `normalizeStateJson()` cho cả `event.stateBefore()` và `event.stateAfter()` trước khi tạo `AuditLog`:

- `null` được giữ là `null`.
- JSON object hợp lệ, ví dụ `{"status":"ACTIVE"}`, được giữ nguyên.
- Giá trị khác (chuỗi trạng thái thường, JSON scalar hoặc JSON array) được serialize thành object dạng `{"status":"<giá trị ban đầu>"}`.
- Bản ghi được ghi bằng `auditLogRepository.saveAndFlush(log)`, để lỗi constraint xảy ra trong lúc lưu và được truyền lên caller.

Ví dụ chuẩn hóa:

| Giá trị caller truyền vào | Giá trị state lưu xuống |
|---|---|
| `ACTIVE` | `{"status":"ACTIVE"}` |
| `AWAITING_VERIFICATION` | `{"status":"AWAITING_VERIFICATION"}` |
| `PENDING` | `{"status":"PENDING"}` |
| `APPROVED` | `{"status":"APPROVED"}` |
| `{"status":"ACTIVE"}` | giữ nguyên JSON object |
| `null` | `null` |

Nhờ chuẩn hóa tập trung này, các caller như PS-33 Cancel Alert không cần tự bọc từng trạng thái trước khi gọi `AuditService.record()`. Các wrapper audit khác cần được kiểm tra để bảo đảm cuối cùng đều đi qua service chuẩn hóa này.

`recordLoginFailure()` có `Propagation.REQUIRES_NEW` theo mục đích riêng. Không chuyển audit của thao tác nghiệp vụ thông thường sang transaction độc lập; với các thao tác như claim case, lỗi audit phải làm rollback cả thao tác nghiệp vụ.

**Giới hạn xác minh:** đọc source xác nhận đường chuẩn hóa đã có, nhưng chưa chứng minh constraint SQL Server thực sự pass trong runtime. Cần Integration Test chạy trên SQL Server thật cho PS-33 Cancel Alert và các luồng quyết định pháp lý có ghi audit; mock `AuditService` không phát hiện được lỗi `ISJSON`.

## Hành động cần audit (AC của PS-13: Auth, Vault, Asset, Will, Trustee, Beneficiary, DMS)

| Nhóm | `action` | Ticket nguồn |
|---|---|---|
| Auth | `AUTH_REGISTERED`, `AUTH_LOGIN_SUCCEEDED`, `AUTH_LOGIN_FAILED` | PS-9, PS-10 |
| Vault | `VAULT_CREATED`, `VAULT_ALERT_CANCELLED` | PS-12, PS-33 |
| Asset | `ASSET_CREATED`, `ASSET_UPDATED`, `ASSET_REVEALED` | PS-15, PS-16 |
| Xác nhận lại mật khẩu | `REAUTH_FAILED` (mỗi lần sai; là bộ đếm cho giới hạn thử, D-API-32) | PS-16 |
| Will | `WILL_UPLOADED`, `WILL_VERSION_ADDED`, `WILL_FILE_OPENED` | PS-17, PS-18 |
| Trustee | `TRUSTEE_APPOINTED`, `TRUSTEE_UPDATED`, `TRUSTEE_REVOKED`, `TRUSTEE_CONTACT_RECORDED` | PS-19, PS-44 |
| Beneficiary | `BENEFICIARY_ADDED`, `BENEFICIARY_UPDATED` | PS-20 |
| Identity verification | `BENEFICIARY_IDENTITY_VERIFIED` | PS-45 |
| DMS | `DMS_CONFIGURED`, `DMS_CHECKED_IN`, `DMS_TRIGGERED`, `DMS_GRACE_PERIOD_EXCEEDED` | PS-22, PS-23 |
| Verification case | `VERIFICATION_CASE_CREATED`, `VERIFICATION_CASE_CLAIMED` | ST-09 |
| Giấy tờ khai tử | `DEATH_DOCUMENT_RECORDED` (loại + ID công khai; không số giấy tờ) | PS-38 (ST-11) |
| Di chúc giấy gốc | `ORIGINAL_WILL_RECEIVED` (chỉ ID công khai; không tên người giao) | PS-39 (ST-13) |
| Thẩm định giấy tờ khai tử | `LEGAL_DEATH_DOCUMENT_DECIDED` (kết quả + ID công khai; không ghi lý do) | PS-36 (ST-12) |
| Đối chiếu di chúc gốc | `WILL_COMPARISON_RECORDED` (kết quả, ID công khai, phiên bản, hash; không ghi lý do) | PS-40 (ST-15) |
| Hồ sơ căn cứ phân chia | `LEGAL_BASIS_CLASSIFIED` (nhánh, ID công khai; không ghi lý do), `LEGAL_BASIS_RECEIVED` (loại, phiên bản, hash; không ghi số văn bản) | PS-41 (ST-16, ST-18) |

## Giao diện nội bộ

`com.legacyvault.audit.AuditService.record(AuditEvent)` ghi audit trong transaction hiện tại. Caller không được nuốt exception khi audit thất bại nếu audit là điều kiện bắt buộc để nghiệp vụ commit.

## Test bám contract

- Trạng thái thường được chuẩn hóa thành JSON object trước khi gọi repository.
- JSON object hợp lệ được giữ nguyên; `null` vẫn là `null`.
- Mỗi hành động cần audit tạo đúng một bản ghi; không có secret trong bản ghi.
- Integration Test trên SQL Server xác nhận các constraint `ISJSON` chấp nhận dữ liệu chuẩn hóa và thao tác nghiệp vụ rollback khi insert audit thất bại.
- **Bất biến:** cố UPDATE/DELETE bản ghi phải thất bại (test với SQL Server thật hoặc kiểm tra quyền/trigger); không tồn tại API sửa/xóa audit.
