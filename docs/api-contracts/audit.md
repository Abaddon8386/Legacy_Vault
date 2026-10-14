# Audit Log append-only — PS-13 (LV-AUD-001)

Trạng thái: **đặc tả nội bộ**; **không có endpoint công khai** trong Sprint 1 (D-API-20). Các API khác gọi `AuditService`.

## Quy tắc

- **Append-only:** nghiệp vụ không UPDATE/DELETE bản ghi audit. Ép buộc ở **mức CSDL** (ví dụ chỉ cấp `INSERT/SELECT` cho tài khoản
  ứng dụng và `DENY UPDATE, DELETE`, hoặc trigger chặn) — phối hợp task database (PS-73). Không viết repository/endpoint sửa hoặc xóa,
  kể cả cho `ROLE_ADMIN`.
- Lưu tối thiểu 12 tháng.
- **Không ghi secret:** mật khẩu, JWT, `payload` tài sản, nội dung/byte file, khóa mã hóa, số định danh đầy đủ.

## Bản ghi tối thiểu

| Trường | Ghi chú |
|---|---|
| `id`, `occurredAt` | thời điểm UTC |
| `actorType` | `USER` \| `SYSTEM` |
| `actorId`, `actorRoles` | null với `SYSTEM` hoặc đăng nhập thất bại không xác định user |
| `action` | mã hành động (bảng dưới) |
| `entityType`, `entityId` | đối tượng bị tác động |
| `stateBefore`, `stateAfter` | nếu có chuyển trạng thái |
| `traceId` | khớp `X-Trace-Id` của request |
| `context` | thông tin phụ **đã lọc** (vd: tên trường đã đổi, sha256, kích thước) |
| `stepId`, `ruleId` | nếu áp dụng (vd `ST-03`, `LV-AUD-001`) |

## Hành động cần audit (AC của PS-13: Auth, Vault, Asset, Will, Trustee, Beneficiary, DMS)

| Nhóm | `action` | Ticket nguồn |
|---|---|---|
| Auth | `AUTH_REGISTERED`, `AUTH_LOGIN_SUCCEEDED`, `AUTH_LOGIN_FAILED` | PS-9, PS-10 |
| Vault | `VAULT_CREATED` | PS-12 |
| Asset | `ASSET_CREATED`, `ASSET_UPDATED`, `ASSET_REVEALED` | PS-15, PS-16 |
| Xác nhận lại mật khẩu | `REAUTH_FAILED` (mỗi lần sai; là bộ đếm cho giới hạn thử, D-API-32) | PS-16 |
| Will | `WILL_UPLOADED`, `WILL_VERSION_ADDED` | PS-17, PS-18 |
| Trustee | `TRUSTEE_APPOINTED`, `TRUSTEE_UPDATED`, `TRUSTEE_REVOKED`, `TRUSTEE_CONTACT_RECORDED` | PS-19, PS-44 |
| Beneficiary | `BENEFICIARY_ADDED`, `BENEFICIARY_UPDATED` | PS-20 |
| Identity verification | `BENEFICIARY_IDENTITY_VERIFIED` | PS-45 |
| DMS | `DMS_CONFIGURED`, `DMS_CHECKED_IN`, `DMS_TRIGGERED` | PS-22, PS-23 |

## Giao diện nội bộ

`AuditService.record(AuditEvent)` được gọi trong cùng giao dịch với thao tác nghiệp vụ để không có thao tác thành công mà thiếu audit.

## Test bám contract

Mỗi hành động trên tạo đúng một bản ghi · không có secret trong bản ghi · **bất biến**: cố UPDATE/DELETE bản ghi phải thất bại
(test với SQL Server thật hoặc kiểm tra quyền/trigger) · không tồn tại API sửa/xóa audit.
