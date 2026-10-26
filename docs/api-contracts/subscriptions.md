# PS-77 — chính sách đang chờ phê duyệt

> **Cập nhật 19/10/2026:** Quyết định mới của người dùng thay giá/chu kỳ trước đây: BASIC miễn phí, STANDARD 499.000đ và EXTENDED 999.000đ trọn đời; nâng cấp trả đủ giá gói đích. Ảnh tài sản 5 ảnh × 5 MiB. Xem [quyết định và contract hiện hành](lifetime-plans-and-asset-images.md). Phần cũ bên dưới giữ để truy vết lịch sử.

Nguồn trạng thái hiện hành: [open-decisions.md §G](open-decisions.md#g-ps-77--đề-xuất-chờ-phê-duyệt-của-nhóm-2026-10-17).
Các trao đổi chat trước đây chỉ là đầu vào đề xuất; chưa có biên bản nhóm chốt giá, hạn mức,
trọn đời hoặc tác động lên evidence pháp lý trong ba tài liệu nguồn.

## Hành vi mặc định

> **Cập nhật PS-92 (D-API-42, đề xuất chờ nhóm xác nhận):** `legacyvault.subscription.quota-enforcement-enabled` mặc định **true**.
> Hạn mức của catalog hiện hành (BASIC 5 / STANDARD 50 / EXTENDED 200 tài sản, 100 MiB / 1 GiB / 5 GiB) được thực thi; di chúc chiếm một chỗ
> trong số tài sản. Chi tiết cách đếm và xử lý Owner đang vượt giới hạn: [assets.md](assets.md#quota-nội-dung--ps-77-ps-92-d-api-42).
> Phần mô tả "mặc định tắt" bên dưới là lịch sử PS-77; cờ nay chỉ là công tắc vận hành (`QUOTA_ENFORCEMENT_ENABLED=false`).

### Lịch sử PS-77 (trước PS-92)

`legacyvault.subscription.quota-enforcement-enabled=false`. Các mức 5/50/200 Asset,
100 MiB/1 GiB/5 GiB và giá 0/199000/499000 VND trong catalog migration là dữ liệu prototype,
không phải chính sách đang áp dụng. Không xóa/sửa checksum migration đã push để thay lịch sử.
Không ép Owner vào quota đề xuất, không sử dụng entitlement cũ kể cả khi bật prototype: hàng tự cấp trước review không phải bằng chứng thanh toán.
Giới hạn payload/upload hiện hữu và authorization/trạng thái Vault vẫn được kiểm tra.

GET `/api/v1/subscription-plans` và `/api/v1/subscriptions/me` yêu cầu VAULT_OWNER;
khi policy chưa bật trả 409 `SUBSCRIPTION_POLICY_PENDING`, không quảng bá catalog là gói đã duyệt.
Cờ enforcement chỉ phục vụ test cô lập cho tới khi có biên bản phê duyệt nhóm.

POST `/api/v1/subscriptions/me/upgrade` yêu cầu VAULT_OWNER và body hợp lệ
`{ "planCode": "STANDARD", "catalogVersion": 2 }`, luôn trả 409
`SUBSCRIPTION_UPGRADE_UNAVAILABLE`. Không cấp dung lượng, không tạo entitlement hoặc audit nâng gói,
kể cả khi bật cờ quota prototype. Staff/Legal trả 403; chưa đăng nhập trả 401.
Không có cơ chế giả định đã thu tiền, endpoint cấp hộ hoặc cờ bật self-grant miễn phí.
Cần quy trình thanh toán/xác nhận tin cậy được nhóm duyệt và triển khai trước khi mở chức năng.

## Evidence pháp lý

Đã gỡ quota subscription khỏi `BasisIntakeService`. Mức 100 MiB/50 phiên bản/10 MiB chỉ là
đề xuất chờ duyệt. PS-41 tiếp tục nhận phiên bản theo quy tắc hiện hữu dù tổng dung lượng vượt
100 MiB hoặc đã có 50 phiên bản. Giới hạn từng upload đã có, Staff sở hữu ca OPEN, route,
Vault/hold guards và transaction audit được giữ nguyên. Không xóa lịch sử pháp lý.

## Phần đã có nguồn xác nhận

Một Vault/Owner theo quyết định A4 trong open-decisions.md. DB giữ unique Owner, chặn physical
DELETE/reassignment; transaction Owner lock bảo vệ tạo kho đồng thời và rollback khi audit lỗi.
Các phép tính usage/quota prototype vẫn có test SQL: UTF-8 payload, mọi Asset kể cả DOCUMENT,
mọi file version lưu giữ; Owner → Vault → Asset locks và refresh chống trạng thái/size cũ.
Đây không phải phê duyệt kích hoạt quota.

## Migration và kiểm thử

PS-77 dùng V19–V22; tránh V12/V13 của PS-44/45, V14–V17 legal/court/hold và V18 PS-37.
Không reset DB thật, repair Flyway hoặc sửa history. Môi trường đã chạy số cũ cần kế hoạch riêng.
`SubscriptionSqlServerTest` bật prototype trong DB ngẫu nhiên dùng một lần để kiểm thử thuật toán,
đồng thời xác minh mặc định policy tắt và không thể cấp gói trả phí.
`LegalEvidenceQuotaSqlServerTest` có annotation điều kiện ngay trên lớp cụ thể; không có
LEGAL_SQLSERVER_MASTER_URL thì bỏ qua trước khi startDatabase, không thử kết nối null.
Hai regression legal chứng minh tổng byte/số phiên bản đề xuất không chặn intake.
Chưa triển khai payment hoặc FE E2E; PR #64 chưa merge.
