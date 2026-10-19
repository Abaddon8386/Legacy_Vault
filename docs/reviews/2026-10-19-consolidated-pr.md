# Tổng hợp thay đổi để review vào develop — 19/10/2026

Repo: `Abaddon8386/Legacy_Vault`. Nhánh: `codex/PS-82-lifetime-plans-images-role-ui`.
Đã tích hợp develop tại `4b613a2` (PS-61 và PS-67–72). Giữ toàn bộ code bàn giao/đóng kho trên develop.
Người dùng yêu cầu tổng hợp các thay đổi đã sửa, commit/push và tạo PR; không yêu cầu merge PR hoặc cập nhật Jira.

## Giao diện và đăng nhập

- Staff dùng sidebar và menu tài khoản chung; khôi phục xem/sửa hồ sơ, đăng xuất, VI/EN thống nhất.
- Backend cung cấp mã dễ đọc `HS-2026-000123`, ổn định từ năm tạo và identity; API/URL vẫn dùng UUID, không đổi ownership hay authorization. Tương thích response cũ chưa có mã.
- Trustee đổi nhãn tiếng Việt thành người thi hành bên ngoài; tách biểu mẫu thêm Trustee/Beneficiary thành dialog ở giữa màn hình, giữ validation và focus phù hợp.
- Bỏ Play/Pause của cảnh 3D landing; thêm liên kết từ login về trang chủ.
- Admin và Beneficiary có trang đích và guard riêng, menu/profile/logout đúng role; không mặc định vào Owner. Không cấp thêm quyền thông qua FE. Các trang đích không giả lập nghiệp vụ chưa tích hợp.
- Giữ cơ chế session theo tab của PR #131 đã merge, kiểm tra regression reload/routing. PR này không chứa Google Login của PR #132 và không triển khai khôi phục mật khẩu.

## Gói và tài sản

- Admin quản lý catalog, lịch sử phiên bản, tạo/sửa draft, publish/ngừng áp dụng; backend RBAC ADMIN, optimistic token, khóa catalog ở DB, audit trước/sau.
- Người dùng đã thay quyết định theo tháng bằng BASIC miễn phí, STANDARD 499.000đ và EXTENDED 999.000đ, mua một lần trọn đời. Nâng cấp trả toàn bộ giá gói đích, không trừ lần mua trước. Quy tắc mới ghi trong contract/decision log, không sửa Jira.
- Catalog và Current API đọc thật, adapter FE khớp response backend, báo giá server kiểm tra version và giá; payment chưa tích hợp nên không tạo thành công giả hoặc cấp entitlement miễn phí.
- Tạo Asset kèm ảnh atomic; tối đa 5 JPEG/PNG mỗi tài sản, 5 MiB/ảnh. Preview/bỏ ảnh trước lưu; thêm/xem/xóa trong chi tiết tài sản. Ảnh mã hóa, cộng vào usage, xem cần mật khẩu và không có URL công khai. Giữ guards khi kho không ACTIVE.
- Di chúc vẫn là luồng riêng; các phiên bản cũ và lịch sử pháp lý không bị sửa.

## Database và tích hợp

Develop mới đã sử dụng V28–V30 cho bàn giao/đóng kho. Ba migration chưa phát hành của phần Admin/giá/ảnh đã đổi sang:

- `V31__admin_subscription_catalog_management.sql`
- `V32__approved_lifetime_prices.sql`
- `V33__encrypted_asset_images.sql`

Không sửa các migration V1–V30 đã có trên develop; không repair/reset database làm việc, không sửa entitlement/giao dịch đã ghi nhận. Database thử cũ chứa số local trước tích hợp được giữ riêng; kiểm chứng nền mới dùng database mới.

## Kiểm chứng và giới hạn

FE trước bước tích hợp backend: 668 test pass, 33 suites; lint/build đạt. Sau nhãn tiền VI/EN cuối, tám test Admin được chạy lại đạt. Bước merge develop không thay source FE. Build còn cảnh báo chunk >500 kB.

BE sau tích hợp develop: `mvnw.cmd clean test` đạt **649 tổng, 511 chạy pass, 138 skip theo điều kiện môi trường; 0 failure/error**. Smoke context được cấu hình bằng DB/khóa test ngoài source. Log local `backend/pr-clean-tests-final.log`.

SQL Server 16 thật trong database mới `LegacyVault_PS77_PRSql20261019`: **28/28 pass**, 0 skip/failure/error, gồm 23 regression subscription và 5 test mới về ảnh/Admin/báo giá. Flyway validate 34 migration files (V1–V33 gồm V5_1). Đã xác minh version giá mới vượt version-2 catalog cũ, báo giá cũ bị stale. Log local `backend/pr-sql-verified.log`; XML trong `backend/target/surefire-reports`.

Fixture kiểm tra một kho trọn đời dùng kho độc lập cho từng trạng thái CLOSED/ARCHIVED/DELETED, không sửa kho ARCHIVED trở lại trạng thái khác. Không vô hiệu hóa trigger hoặc nới quyền để làm test đạt. Lớp SQL mới có guard môi trường riêng để không tự kết nối DB khi thiếu cấu hình.

Khi đổi số migration cần `mvnw.cmd clean` để xóa các bản copy số cũ trong `target/classes/db/migration`; không repair history database. Hai database thử mới dùng cho smoke và SQL được tách khỏi database cũ có số local V28–V30 trước tích hợp.

Browser tool không kết nối được localhost nên không có screenshot/browser E2E. Test component là JSDOM; HTTP → BE → SQL Server là MockMvc với service/JPA/database thật, không mô tả chúng là browser E2E.

Payment/checkout/webhook và quyền trả phí thực tế chưa tích hợp. Quota enforcement vẫn tắt mặc định. Catalog, usage, ảnh và Admin chạy độc lập; PR không tự hoàn thành phần payment. Database làm việc chưa được migration bởi Codex; người dùng cần khởi động lại backend theo cấu hình hiện có để Flyway chạy V31–V33. Không thay khóa mã hóa của DB đang chứa dữ liệu.

Không commit secret, `.env` thật, log chạy thử hoặc output build. Các tài khoản demo đã chỉnh trên DB trước đó không phải migration cấp tài khoản trong PR này.
