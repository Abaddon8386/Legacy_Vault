# Dead Man's Switch — PS-22, PS-23 (ST-06, ST-07, LV-DEATH-001)

## BE-03 — Owner cấu hình Grace Period (ngày–giờ–phút)

PUT `/api/v1/dms` nhận thêm **tùy chọn** đúng một trong `gracePeriodMinutes` (0–43200, tức tối đa 30 ngày) hoặc `gracePeriodDays` (0–30). Gửi cả hai, số thập phân, chuỗi, âm hoặc vượt ngưỡng: 400 (`MALFORMED_REQUEST` / `VALIDATION_FAILED` như checkInterval). `0` hợp lệ: `graceDeadline = triggeredAt`, scheduler chuyển `GRACE_PERIOD_EXCEEDED` ở nhịp quét kế tiếp.

- **Mặc định:** Owner chưa từng lưu Grace → lấy `DMS_GRACE_PERIOD_DAYS` (1 ngày = 1440 phút) khi tạo DMS lần đầu.
- **Client cũ** (không gửi trường Grace): giữ nguyên Grace đang lưu của chính Owner đó.
- **Chỉ đổi Grace** (có trường Grace và interval không đổi): không reset `lastCheckInAt/nextCheckAt`. Nếu interval đổi thì chu kỳ được đặt lại như trước.
- Chỉ sửa được khi DMS `MONITORING` và kho cho phép sửa; `TRIGGERED`/`GRACE_PERIOD_EXCEEDED` → `409 DMS_NOT_MONITORING`, nên không kéo dài deadline của ca đã kích hoạt. `graceDeadline` được chốt tại thời điểm `TRIGGERED` từ giá trị đã lưu.
- Mỗi Owner một giá trị độc lập (cột trên `dms_configs`, migration V50). Cột NULL = hàng cũ, đọc là `grace_period_days × 1440`.
- Cancel Alert/hết Grace không đổi: hết Grace không xác nhận tử vong, không unlock.

Response (GET/PUT) thêm `gracePeriodMinutes` (chính xác); `gracePeriodDays = floor(gracePeriodMinutes / 1440)`:

```json
{ "status":"MONITORING", "checkIntervalDays":null, "checkIntervalMinutes":90,
  "gracePeriodDays":1, "gracePeriodMinutes":1563, "nextCheckAt":"2026-10-20T09:30:00Z", "graceDeadline":null }
```

## PS-91 — quyết định người dùng 20/10/2026

Cho phép chu kỳ **1–259.200 phút (180 ngày), kể cả phiên thật/production**. PUT `/api/v1/dms` nhận đúng một trong `{ "checkIntervalMinutes": 90 }` hoặc legacy `{ "checkIntervalDays": 30 }` (1–180 ngày, vẫn tôn trọng min/max ngày server nếu hẹp hơn). Không gửi cả hai, kể cả khi tương đương. Không nhận đơn vị khác, field lạ, key trùng, chuỗi, số thập phân hoặc overflow: 400 `MALFORMED_REQUEST`; thiếu/cả hai/âm/0/vượt ngưỡng: 400 `VALIDATION_FAILED`. Lỗi VI/EN dùng shared contract. Các phần mô tả chỉ dùng ngày bên dưới là contract lịch sử trước PS-91.

Response thêm `checkIntervalMinutes` luôn là thời lượng chính xác. `checkIntervalDays` giữ số nguyên khi chia hết cho 1440, nếu không là **null**, không làm tròn. Ví dụ sau PUT 90 phút: `{ "status":"MONITORING", "checkIntervalDays":null, "checkIntervalMinutes":90, "gracePeriodDays":1, "nextCheckAt":"2026-10-20T09:30:00Z" }` nếu giờ server lúc lưu là 08:00Z; đây chỉ là trích response, các field owner/timestamps hiện hữu vẫn có. Client mới phải đọc phút; client cũ gửi ngày vẫn nhận ngày chính xác, nhưng không được ép null thành 0/1 ngày khi hồ sơ đã được client khác cấu hình phút.

Cấu hình, check-in và Cancel Alert đều đặt lại deadline bằng **giờ server + đúng số phút**. Scheduler giữ nhịp quét hiện hành (mặc định 60 giây), xử lý tại/qua `nextCheckAt`, có thể trễ một nhịp quét hoặc lâu hơn khi backlog; không hứa timer đến đúng từng giây. Grace period, quyền, khóa Vault→DMS, audit/rollback và nguyên tắc quá hạn không xác nhận chết/không unlock không đổi.

V36 chỉ ALTER schema, không UPDATE/backfill: giữ nguyên toàn bộ hàng cũ, cả archived và timestamps. Minutes NULL trong DB được đọc bằng ngày cũ ×1440; dữ liệu cũ trên 180 ngày vẫn đọc/check-in/cancel đúng thời lượng, chỉ request cấu hình mới chịu trần 180 ngày. Ràng buộc DB giữ đường insert legacy và chặn cặp ngày/phút bất nhất. Không sửa migration/checksum/history. V34 PS-86 và V35 PS-80 đang ở PR riêng; triển khai các version thấp trước V36, hoặc điều phối migration version mới, không bật out-of-order/repair tự động. Rollback phải giữ reader biết cột phút và ngày nullable, không quay về binary chỉ biết ngày khi đã có chu kỳ lẻ.

PR BE bàn giao contract cho FE PS-91; không đổi mock thành live hoặc tự nối UI của người phụ trách khác.

Trạng thái: **contract đã chốt**. Quyền: `VAULT_OWNER`. DMS thuộc **tài khoản Owner** (mỗi Owner một DMS), nên đường dẫn là `/api/v1/dms` — Owner luôn lấy từ người đăng nhập, không có `ownerId`/`vaultId` trên URL hay trong request (trừ scheduler PS-23: tác vụ nội bộ).

## Nguyên tắc nghiệp vụ

- DMS chỉ là bộ đếm sự sống. **Hết hạn ≠ xác nhận tử vong.** Không có trạng thái `DEATH_CONFIRMED`, không `UNLOCKED`,
  không giải mã, không gửi tài sản cho bất kỳ ai (LV-DEATH-001).
- Owner cấu hình chu kỳ; check-in đặt lại `nextCheckAt`.
- Khoảng giá trị cho phép của `checkIntervalDays` do cấu hình qua property, không hardcode (D-API-15).
- **Grace Period mặc định 1 ngày**, cấu hình phía server bằng `DMS_GRACE_PERIOD_DAYS` (0–30 ngày). Owner đổi giá trị riêng qua PUT `/api/v1/dms` (xem BE-03).

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
  `404 RESOURCE_NOT_FOUND` (Owner chưa có Vault) ·
  `422 BENEFICIARY_REQUIRED` (Vault đã tồn tại nhưng chưa có Beneficiary — PS-21) · `409 VAULT_NOT_EDITABLE`.
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

Check-in và cập nhật cấu hình đọc DMS bằng `PESSIMISTIC_WRITE` trong cùng transaction với
ghi dữ liệu và audit. Nếu Owner giữ khóa trước, scheduler chờ commit rồi kiểm tra lại điều kiện
quá hạn trên dữ liệu mới. Nếu scheduler chuyển `TRIGGERED` trước, Owner đọc trạng thái đó sau
commit và nhận `409 DMS_NOT_MONITORING`; không ghi đè trạng thái hoặc tạo audit check-in/cấu hình.

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

### Kiểm thử cạnh tranh trên SQL Server

`DmsSqlServerConcurrencyTest` dùng service/repository/audit thật và hai transaction trên hai thread.
Test dừng Owner ngay sau khi đọc DMS, trước khi ghi, để kiểm tra scheduler phải chờ khóa; đồng thời
kiểm tra scheduler commit trước check-in và trước cập nhật cấu hình. Cả trạng thái cuối và số audit
được kiểm tra. Test không dùng H2 hoặc Mockito.

Chỉ chạy trên database SQL Server dùng một lần, có tên bắt đầu bằng `LegacyVault_DmsConcurrency_`.
Đặt `DMS_SQLSERVER_TEST_URL` bằng JDBC URL của database đó và chạy:

```text
mvn -f backend/pom.xml -Dtest=DmsSqlServerConcurrencyTest test
```

Flyway khởi tạo schema. Audit append-only được giữ nguyên; xóa database thử nghiệm sau khi kết thúc.
Nếu không đặt biến môi trường trên, test được bỏ qua.
