# PS-80 — kiểm chứng local 20/10/2026

Base `develop` 31c57d3, branch `feature/PS-80-one-time-payments`. Quyết định: giữ Free/499.000đ/999.000đ, mua một lần dùng trọn đời, VNPay sandbox. Chưa merge, không thay trạng thái Jira, không đưa handoff/secret/log vào commit.

## Phạm vi kiểm thử

- Backend unit/MVC và SQL Server thực: server price/version, Free, paid snapshot, giá nâng cấp đầy đủ, ownership/role/JWT, sai merchant/amount/currency/signature, trùng query, pay date sai, pending/failure/out-of-order/late IPN, không hạ gói, idempotency và concurrent create/IPN, gateway transaction uniqueness, rollback khi audit lỗi, bảo toàn Vault/Asset, Owner bị khóa, Admin đọc đúng gói đã trả.
- Fresh migration qua các fixture ứng dụng; upgrade V33 → V35 riêng trong PaymentSqlServerTest; V27 → latest giữ nguyên kho và chạy lại không tạo migration mới. Test upgrade cũ bỏ giả định cố định 3 migration, vẫn yêu cầu V28/V29/V30 có mặt.
- FE adapter/component: quote từ catalog server, xác nhận mua, sandbox URL allowlist, chưa cấu hình không tạo đơn, client success không cấp gói, backend success refresh một lần, ref alphanumeric khôi phục UUID, double click và retry giữ idempotency key.
- Kiểm tra OpenAPI resolve refs/error enum; lint file FE thay đổi; production build; git diff whitespace.

## Kết quả

Frontend `npm test`: **893 pass, 0 fail/skip**. Chạy chuyên biệt sau thay đổi cuối `node --test src/utils/paymentService.test.mjs src/utils/paymentComponent.test.mjs`: **9 pass** (8 đã có trong bộ 893, 1 bổ sung test retry). Production build pass, chỉ có cảnh báo chunk size; ESLint các file thay đổi pass.

Backend `mvnw.cmd '-Dtest=*,!LegacyvaultBackendApplicationTests' clean test`, bật `LEGAL_SQLSERVER_MASTER_URL` và `STAFF_SQLSERVER_MASTER_URL`: **665 test — 611 pass, 54 skip, 0 failure/error**. Riêng PaymentSqlServerTest **13 pass**, VnPayGatewayTest **3 pass**. Skip do opt-in riêng: SubscriptionSqlServerTest 23, LifetimeImagesSqlServerTest 28 (gồm inherited cases), DMS concurrency 3. Mọi test SQL dùng database ngẫu nhiên riêng, không dùng database ứng dụng. Log thô được giữ local và bị Git ignore.

Sau lượt sạch: `mvnw.cmd '-Dtest=LifetimeImagesSqlServerTest#lifetime*' test` trên DB `LegacyVault_PS77_PS80_<random>`: **5 pass**. `mvnw.cmd '-Dtest=LegacyvaultBackendApplicationTests' test` với DB_URL trỏ cùng DB tạm: **1 pass**. Tổng test backend không trùng lượt chạy: **617 pass, 49 còn skip, 0 failure/error** (5 ca lifetime chuyển từ skip sang pass). Database PS-80 và payment fixture sau cleanup: **0 còn lại**. Các kết quả là local, không thay thế GitHub CI hay VNPay E2E.

## Giới hạn và thứ tự triển khai

Chưa có merchant sandbox nên **chưa xác minh E2E với VNPay thật**. Secret fixture chỉ dùng ký callback trong DB test, không dùng cho triển khai. Cấu hình merchant, HTTPS IPN/Return URL rồi kiểm thử giao dịch sandbox trước khi bật checkout. Không thực hiện giao dịch live, tự cấp gói hoặc thu tiền.

V34 thuộc PS-86 PR #151 đang mở; V35 payment độc lập với invitation. Nếu triển khai cả hai, áp dụng V34 trước V35 hoặc điều phối version migration mới cho PS-86; không repair history/bật out-of-order để lách thứ tự. Không rollback binary làm mất khả năng đọc gói đã trả; giữ bảng/payment reader/IPN, ưu tiên roll forward.

Quota enforcement giữ mặc định false theo quyết định trước; payment snapshot và catalog vẫn đọc bình thường. Admin account lookup đã đọc gói thanh toán; UI/endpoint Admin transaction search của PS-82 chưa được nối. QueryDR/refund/live gateway ngoài phiên bản sandbox này. Chi tiết: [contract VNPay](../api-contracts/payments-vnpay.md).
