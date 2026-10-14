# Dead Man's Switch — PS-22, PS-23 (ST-06, ST-07, LV-DEATH-001)

Trạng thái: **contract đã chốt**. Quyền: `VAULT_OWNER`. DMS thuộc **tài khoản Owner** (mỗi Owner một DMS), nên đường dẫn là `/api/v1/dms` — Owner luôn lấy từ người đăng nhập, không có `ownerId`/`vaultId` trên URL hay trong request (trừ scheduler PS-23: tác vụ nội bộ).

## Nguyên tắc nghiệp vụ

- DMS chỉ là bộ đếm sự sống. **Hết hạn ≠ xác nhận tử vong.** Không có trạng thái `DEATH_CONFIRMED`, không `UNLOCKED`,
  không giải mã, không gửi tài sản cho bất kỳ ai (LV-DEATH-001).
- Owner cấu hình chu kỳ; check-in đặt lại `nextCheckAt`.
- Khoảng giá trị cho phép của `checkIntervalDays` do cấu hình qua property, không hardcode (D-API-15).
- **Grace Period mặc định 1 ngày**, cấu hình phía server bằng `DMS_GRACE_PERIOD_DAYS` (0–32767 ngày; DB `SMALLINT`). Sprint 1 chưa có trường/endpoint để Owner đổi giá trị này (ticket PS-22 chỉ cấu hình chu kỳ).

## Mô hình `DmsResponse`

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `ownerId` | UUID | `public_id` của tài khoản Owner (`users`). DMS thuộc **tài khoản Owner**, mỗi Owner đúng một DMS (`dms_configs.owner_user_id UNIQUE`) |
| `status` | enum `MONITORING` \| `TRIGGERED` \| `GRACE_PERIOD_EXCEEDED` | Sprint 1 FE chủ yếu thấy `MONITORING`, `TRIGGERED` |
| `checkIntervalDays` | int | cột `check_interval_days` |
| `gracePeriodDays` | int | chỉ đọc; cột `grace_period_days`, mặc định 1 (A5) |
| `lastCheckInAt` | datetime \| null | cột `last_check_in_at` |
| `nextCheckAt` | datetime | = `lastCheckInAt` (hoặc thời điểm cấu hình) + `checkIntervalDays` ngày |
| `triggeredAt` | datetime \| null | có khi `TRIGGERED` |
| `graceDeadline` | datetime \| null | có khi `TRIGGERED` — cột `grace_period_ends_at` |
| `updatedAt` | datetime | cột `updated_at` |

`ownerId` luôn là người đang đăng nhập; client không gửi và không được chọn Owner khác.

## PUT /api/v1/dms — PS-22

- Bật hoặc đổi chu kỳ. **Request:** `{ "checkIntervalDays": 30 }` (ví dụ nêu trong ST-06: 30, 90).
- **Response 200:** `DmsResponse` (`status: MONITORING`, `nextCheckAt` đã tính).
- **Lỗi:** `400 VALIDATION_FAILED` (thiếu/ngoài khoảng cho phép) · `401` · `403` ·
  `422 BENEFICIARY_REQUIRED` (Owner chưa có Beneficiary hoặc chưa có Vault — PS-21) · `409 VAULT_NOT_EDITABLE`.
- **Audit:** `DMS_CONFIGURED`.

## GET /api/v1/dms

- **Response 200:** `DmsResponse` · `404 RESOURCE_NOT_FOUND` nếu Owner chưa bật DMS.

## POST /api/v1/dms/check-in — PS-22

- Owner xác nhận còn sống. Không có body.
- **Hành vi:** `lastCheckInAt = now`, `nextCheckAt = now + checkIntervalDays`. **Không** mở khóa, **không** giải mã.
- **Response 200:** `DmsResponse` mới.
- **Lỗi:** `401` · `403` · `404` (chưa bật DMS) · `409 DMS_NOT_MONITORING` khi DMS không ở `MONITORING` — Sprint 1 từ chối như trên (D-API-27); luồng huỷ
  báo động trong lúc `TRIGGERED`/Grace (LV-OWN-001) là việc riêng ở sprint sau.
- **Audit:** `DMS_CHECKED_IN`.

## PS-23 — Scheduler `TRIGGERED` + Grace (không có HTTP endpoint)

| Mục | Đặc tả |
|---|---|
| Kích hoạt | Tác vụ định kỳ (`@Scheduled`), chu kỳ quét cấu hình qua property (D-API-15) |
| Chọn đối tượng | DMS `status = MONITORING` và `nextCheckAt` ≤ thời điểm hiện tại |
| Hành động | `status → TRIGGERED`, ghi `triggeredAt`, tính và lưu `graceDeadline = triggeredAt + gracePeriod` (cấu hình) |
| Idempotent | Chạy lại/chạy chồng không tạo trùng: cập nhật có điều kiện `WHERE status = 'MONITORING'` (D-API-28) |
| Giao dịch | Mỗi DMS (Owner) một giao dịch; lỗi một DMS không chặn DMS khác |
| Audit | `DMS_TRIGGERED`, actor = `SYSTEM`, kèm `ownerId` (và `vaultId` nếu có), `graceDeadline` |
| **Cấm** | Đặt `DEATH_CONFIRMED`, `UNLOCKED`, giải mã, đổi `vaults.status` sang mở khóa |
| Ngoài PS-23 | Chuyển `GRACE_PERIOD_EXCEEDED`, `AWAITING_VERIFICATION`, thông báo Staff (ST-08/09) |

Test: scheduler chọn đúng DMS quá hạn (và bỏ qua chưa quá hạn / không `MONITORING`) · lưu `graceDeadline` · chạy lại không đổi ·
audit được ghi · khẳng định không có thay đổi trạng thái mở khóa.
