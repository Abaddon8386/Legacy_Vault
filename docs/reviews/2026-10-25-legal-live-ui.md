# Legal — giao diện thật và 9 nguyên tắc UI/UX

Ngày 25/10/2026, tiếp nối PR #213 đã merge vào develop tại `3ca385684679b3b6187c1895de240f35a5899a9f`. Phạm vi thay đổi: Legal và đường dẫn review cũ. Giữ giao diện forest/cream/gold, font dùng chung và shell hiện có.

## Thiết kế và hành vi

Gỡ toàn bộ toolbar “DEV · Dữ liệu mô phỏng / Synthetic data” và bộ chọn tình huống. Xóa entry React cùng CSS riêng của trang review, bao gồm transport HTTP và phiên đăng nhập mô phỏng. URL review cũ chuyển vào ứng dụng thật, chỉ giữ `lang` VI/EN và `caseId` đúng định dạng UUID; không mang theo tham số preview/scenario. Phiên đăng nhập, quyền Legal và API vẫn do ứng dụng thật xử lý.

Nội dung hồ sơ dùng chữ 16px, hướng dẫn phụ 14px và mục tiêu tương tác tối thiểu 44px. Desktop rộng đặt tài liệu bên trái, quyết định bên phải; khung quyết định bám theo khi cuộn và có giới hạn chiều cao. Màn hẹp xếp theo thứ tự đọc; phân bổ chuyển từ bảng sang nhóm trường khi khung chứa hẹp hơn 560px. Dùng thuộc tính CSS logical và giữ đường viền focus rõ.

| Nguyên tắc đã thống nhất | Áp dụng trong Legal |
|---|---|
| 1. Chuyển dữ liệu kỹ thuật sang ngôn ngữ người dùng | Dùng `legalPresentation` cho trạng thái/ngày giờ; mã lạ không hiển thị nguyên văn. Phiên hết hạn có lời nhắc đăng nhập lại riêng, không bị báo thành thiếu quyền. |
| 2. Giải thích thao tác chưa khả dụng | Giữ lý do thiếu tài liệu, phiên bản chưa chuyển, tạm dừng hoặc chưa đủ điều kiện; liên kết đến bước xử lý nếu hệ thống xác định được. |
| 3. Một hành động chính trong mỗi vùng | Giữ form quyết định với một nút chính; tải lại/xem tệp là nút phụ; từ chối/mở khóa có xác nhận hệ quả riêng. |
| 4. Thống nhất thuật ngữ | Menu, tiêu đề và điều hướng dùng `LEGAL_NAVIGATION_REGISTRY`; “Chi tiết kỹ thuật” dùng cùng thành phần trên hồ sơ và phân bổ. |
| 5. Màu có ý nghĩa và kèm chữ/biểu tượng | Chờ/tạm dừng màu vàng, hoàn tất màu xanh lá, thông tin màu xanh trung tính, lỗi màu đỏ, hồ sơ đóng/hủy màu trung tính; badge có icon và nhãn. |
| 6. Nhãn và giá trị dễ đối chiếu | Thông tin hồ sơ dùng danh sách nhãn/giá trị; phân bổ có các trường tài sản, người nhận, phần được hưởng và nguồn người nhận. |
| 7. Hồ sơ kết thúc chỉ đọc | Giữ guard đóng/hủy/lưu trữ/hoàn tất; ẩn form và giải thích vì sao không thể chỉnh sửa. |
| 8. Thu gọn mã kỹ thuật và cho sao chép | Mã tài sản/người nhận dùng `LegalTechnicalDetails`, mặc định đóng và có nút sao chép được đặt tên theo trường. |
| 9. Dùng shell và font chung | URL review mở `App` thật; giữ AppShell, sidebar, breadcrumb, font token và lựa chọn ngôn ngữ đang dùng. |

## Kiểm tra

- **249/249** kiểm thử liên quan đạt: Legal, Admin, shared UI, case link, Shared with me và DMS. Bao gồm hồi quy phiên hết hạn không gọi API, metadata BE-02 và mã tham chiếu thu gọn có nút sao chép trong VI/EN.
- ESLint các file JavaScript/JSX thay đổi đạt; production build đạt. Còn cảnh báo kích thước bundle ứng dụng lớn hơn 500 kB.
- Kiểm tra CSS tĩnh: thứ tự DOM giữ nguyên, `min-width:0`, giới hạn khung chứa, wrap mã dài và bố cục co giãn. Nghiệm thu trực quan desktop/mobile, 320px, zoom 200%, RTL, pseudo-localization và bàn phím: **Not verified**; Chrome đang thu nhỏ nên công cụ chưa chụp được trang mới.
- Các kiểm thử FE sử dụng fixture HTTP theo contract. Đây không phải bằng chứng chạy nghiệp vụ trên backend/SQL Server thật.

Lệnh kiểm tra từ `frontend`:

```text
node --max-old-space-size=512 --test --test-concurrency=1 src/utils/legalPresentation.test.mjs src/utils/legalLiveService.test.mjs src/utils/legalLiveComponent.test.mjs src/utils/legalReadIntegration.test.mjs src/utils/legalEvidence.test.mjs src/utils/adminComponent.test.mjs src/utils/adminReviewFixes.test.mjs src/utils/sharedUiComponent.test.mjs src/utils/caseLinkWorkflow.test.mjs src/utils/sharedWithMeAppIntegration.test.mjs src/utils/dmsService.test.mjs src/utils/dmsComponentValidation.test.mjs
node node_modules/eslint/bin/eslint.js src/pages/legal/LegalAllocations.jsx src/pages/legal/LegalLiveWorkflow.jsx src/pages/legal/legalPresentation.js review/legal-workflow.js
npm.cmd run build
```

## Kết nối backend thật

Frontend dùng `/api/v1` với bearer token của phiên thật. Vite proxy `/api` tới `API_PROXY_TARGET` hoặc mặc định `http://localhost:8080`. Không cần thêm adapter mô phỏng để nối Legal.

Đã thử khởi động backend bằng JDK 25 và các biến môi trường hiện có. Flyway chặn khởi động vì **checksum migration V50 khác lịch sử database**:

```text
Migration checksum mismatch for migration version 50
Applied to database : -2139583912
Resolved locally    : 1812363944
```

BE cần đối chiếu nội dung `V50__beneficiary_court_origin.sql` với migration đã chạy và cung cấp phương án đồng bộ lịch sử hợp lệ. Chưa sửa file migration, chạy `repair`, tắt validation hoặc reset database. Chưa có backend hoạt động tại cổng 8080 nên chưa kiểm tra đọc/ghi hồ sơ thật.

Sau khi BE giải quyết V50, khởi động backend rồi mở `http://127.0.0.1:5197/legal/death-verification`. Cần phiên đăng nhập thuộc vai trò `LEGAL_VERIFIER` và hồ sơ được cấp quyền để nghiệm thu API. URL review cũ sẽ tự chuyển vào cùng luồng thật; không có dữ liệu giả thay thế khi backend lỗi.

Kiểm thử SQL cô lập là điều kiện riêng: `LEGAL_SQLSERVER_MASTER_URL` cần tài khoản tạo/xóa DB tạm trên SQL Server kiểm thử. Người dùng đã cho biết sẽ nhờ BE cấu hình; chưa chạy lại bộ test này. Không lưu thông tin kết nối hoặc mật khẩu vào báo cáo.
