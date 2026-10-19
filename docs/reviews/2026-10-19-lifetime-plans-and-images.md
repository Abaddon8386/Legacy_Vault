# Bàn giao local — gói trọn đời và ảnh tài sản

Repo `Abaddon8386/Legacy_Vault`, checkout `C:\Users\hai\Downloads\FALL26\SWP\Legacy_Vault`, nhánh `codex/fix-session-reload-staff-sidebar`. Thay đổi chưa commit, cùng workspace chứa các sửa auth/Staff/Beneficiary trước đó. Không cập nhật Jira theo yêu cầu người dùng; không commit/push/PR/merge.

## Quyết định và thay đổi

- BASIC miễn phí; STANDARD 499.000đ; EXTENDED 999.000đ, mua một lần trọn đời. Nâng cấp trả toàn bộ giá gói đích, không khấu trừ lần mua trước.
- V31 của Antigravity được giữ nguyên. V32 thêm cấu hình LIFETIME mới và cột giá mua riêng, giữ giá tháng cũ cho lịch sử. Không sửa entitlement/giao dịch cũ. Mọi cấu hình mới chỉ dùng LIFETIME.
- Backend báo giá kiểm tra catalog/version, lấy giá từ server, trả `previousPurchaseCreditVnd=0` và `paymentAvailable=false`; không tự cấp gói. Quy tắc STANDARD → EXTENDED trả đủ 999.000đ có unit test.
- Chống ghi đồng thời bằng khóa catalog tại SQL Server, `@Version` trên phiên bản và filtered unique indexes. Ngừng áp dụng cập nhật `is_available`; catalog Owner loại gói đã ngừng. BASIC được giữ làm mặc định. Audit có snapshot các trường cấu hình trước/sau.
- Owner đọc thông tin gói/usage từ API thật mà không cần bật enforcement prototype. Sửa adapter FE để nhận đúng Current DTO từ backend; không biến dữ liệu giả thành phiên thật.
- Tạo tài sản kèm tối đa 5 ảnh JPEG/PNG, mỗi ảnh 5 MiB; ảnh lỗi rollback cả tài sản. Có preview/bỏ ảnh trước lưu và quản lý thêm/xem/xóa tại Chi tiết tài sản. Backend kiểm tra nội dung, kích thước, số ảnh, ownership, trạng thái Vault và upload đồng thời.
- Ảnh lưu AES-GCM; AAD gắn Asset UUID + Image UUID, không public URL. Xem ảnh xác nhận mật khẩu hiện tại, response no-store/nosniff/attachment. FE dùng Blob URL và thu hồi khi đóng. Byte ảnh được cộng vào usage, xóa ảnh giải phóng byte.
- Không đổi quy trình di chúc: nhiều hồ sơ và nhiều phiên bản vẫn giữ nguyên; ảnh tài sản không trở thành di chúc hoặc chứng cứ đã duyệt.

## Kiểm chứng

1. Toàn suite FE cuối: **668 pass, 33 suites**, không fail/skip/cancel, 172,6 giây; lưu tại `frontend/lifetime-fe-final.log`. Bao gồm hai component test ảnh VI/EN và ba test service/adapter ảnh. Sau chỉnh nhãn tiền VI/EN cuối, tám test Admin liên quan cũng chạy lại đạt.
2. Lượt FE tập trung cuối: **13 pass**, gồm Admin service/component và ảnh service/component. `npm run lint`, `npm run build` đạt; build còn cảnh báo chunk >500 kB như nền.
3. BE unit/controller/contract liên quan: **64 pass**, không fail/error/skip, lưu tại `backend/lifetime-unit-final.log`.
4. SQL Server 16 thật tại database thử **LegacyVault_PS77_Review20261019_1625**: Flyway chạy V1–V33 và validate. Suite subscription nền **23 pass**; suite mới `LifetimeImagesSqlServerTest#lifetime*` lượt cuối **5 pass**, không fail/error/skip. Log `backend/lifetime-complete-verification.log`, `backend/lifetime-sql-final.log`; XML trong `backend/target/surefire-reports`.
5. SQL mới kiểm tra HTTP multipart → Spring/JPA → SQL, ciphertext khác byte gốc, download trả byte gốc sau reauthentication, 401/403/404, usage trước/sau xóa, rollback upload hỏng, tranh chấp số ảnh, update stale, publish/retire/history, hai Admin tạo draft chỉ một thành công và báo giá không cấp quyền.
6. `SubscriptionContractTest` parse OpenAPI và kiểm tra enum lỗi, bao gồm `ASSET_IMAGE_LIMIT_EXCEEDED`. `git diff --check` đạt.

Lệnh chạy lại BE unit (PowerShell trong backend):

```powershell
.\mvnw.cmd test "-Dtest=AdminSubscriptionServiceTest,AdminSubscriptionControllerTest,SubscriptionContractTest,SubscriptionPolicyPendingTest,AssetImageValidationTest,LifetimeUpgradePriceTest,AssetServiceTest,AssetControllerTest" "-DargLine=-javaagent:C:/Users/hai/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar"
```

SQL test cần database thử riêng đã tạo, đúng prefix được guard, cùng JDBC native DLL cài trên máy; không dùng DB làm việc. Chỉ thiết lập biến cho process thử:

```powershell
$env:PS77_SQLSERVER_TEST_DATABASE='LegacyVault_PS77_Review20261019_1625'
$env:PS77_SQLSERVER_TEST_SERVER='localhost:1433'
.\mvnw.cmd test "-Dtest=LifetimeImagesSqlServerTest#lifetime*,SubscriptionSqlServerTest" "-DargLine=-Djava.library.path=C:/Users/hai/Downloads/sqljdbc_13.6/enu/auth/x64 -javaagent:C:/Users/hai/.m2/repository/org/mockito/mockito-core/5.23.0/mockito-core-5.23.0.jar"
```

## Giới hạn và bước chạy thử

- Chưa triển khai checkout/webhook/cổng thanh toán; không thể mua/nâng gói trả phí thật. Chỉ có catalog, quy tắc và báo giá server, không success giả. Entitlement prototype cũ không phải bằng chứng thanh toán.
- Quota enforcement mặc định vẫn tắt; test SQL bật trong môi trường thử để kiểm chứng thuật toán, không bật ngầm cho DB thật.
- Chưa áp dụng migration lên DB làm việc. Khởi động lại backend bằng cấu hình sẵn có để Flyway chạy V31–V33, rồi khởi động lại FE. Không chạy migration thủ công/repair/reset DB. Không thay khóa mã hóa hiện có khi khởi động DB chứa dữ liệu thật.
- Browser tool không truy cập được localhost (`ERR_CONNECTION_TIMED_OUT`); không có bằng chứng screenshot hoặc browser E2E. Component test là JSDOM, SQL HTTP test dùng MockMvc với server/service/repository thật. Hai server thử cổng 18082/5196 đã dừng.
- Không thể xác nhận mọi thay đổi ngoài phạm vi PS-82 đã đáp ứng tất cả AC; báo cáo này chỉ xác nhận phạm vi và bằng chứng nêu trên.

Contract hiện hành: [lifetime-plans-and-asset-images.md](../api-contracts/lifetime-plans-and-asset-images.md).
