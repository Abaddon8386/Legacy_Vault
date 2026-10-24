# Đồng bộ giao diện System Administrator

Nhánh: `feat/admin-ui-alignment`, bắt đầu từ `origin/develop` tại `ebd7c2b`.

## Phạm vi và hướng thiết kế

Giữ sidebar xanh hiện có. Phần nội dung dùng font sans-serif của hệ thống, nền trắng trên canvas sáng, chữ xanh đậm `#203e33`, màu thao tác chính `#244b3d`, chữ phụ `#63746b` và viền `#dfe5de`. Bộ lọc, bảng dữ liệu và hành động được tách thành các nhóm rõ ràng; nút và ô nhập có chiều cao tối thiểu 44px.

Các phần được chia thành commit:

1. Chuẩn hóa kiểu chữ, nút, cảnh báo, bảng và hộp thoại dùng chung.
2. Tổng quan: bốn chỉ số, phân bố vai trò và truy cập nhanh. Thời gian thu thập và phạm vi quyền nằm trong phần mở rộng.
3. Người dùng/Nhật ký: nhãn bộ lọc, số kết quả, tên vai trò và hành động dễ đọc, mã kỹ thuật giữ lại để đối chiếu, bảng cuộn riêng và chi tiết có phân cấp.
4. Gói sử dụng/Thanh toán: sửa stylesheet không khớp với phần tử thực tế, thẻ gói, lịch sử phiên bản, tra cứu hạn mức, bộ lọc giao dịch và hộp thoại. Chọn gói bằng bàn phím đưa tiêu điểm tới lịch sử; đóng lịch sử trả tiêu điểm về thẻ gói. Hộp thoại bản nháp dùng cơ chế quản lý tiêu điểm chung.

## Kiểm tra

- `npm run lint`: đạt.
- `npm run build`: đạt; vẫn có cảnh báo kích thước bundle hiện có của ứng dụng.
- Sáu bộ kiểm tra Admin: **59/59 đạt** (`adminComponent`, `adminReviewFixes`, `adminService`, `adminSubscriptionComponent`, `adminSubscriptionService`, `adminPayments`).
- Trình duyệt nối backend thật: Tổng quan, Người dùng, Nhật ký, danh mục và lịch sử gói, tra cứu tài khoản, danh sách giao dịch.
- Kích thước kiểm tra: 1280px desktop; 390px và 320px mobile. Không phát hiện tràn ngang toàn trang; các bảng lớn cuộn trong vùng riêng.
- Kiểm tra VI/EN, lọc vai trò Admin, mở chi tiết tài khoản/nhật ký, mở lịch sử gói bằng Enter, mở hộp bản nháp rồi đóng bằng Escape và kiểm tra tiêu điểm quay lại.
- Dữ liệu giao dịch hiện tại rỗng; bảng có giao dịch được kiểm tra bằng fixture trong bộ kiểm tra hiện có. Không công bố/ngừng gói hoặc thực hiện thanh toán khi rà giao diện.
- Chưa kiểm tra riêng browser zoom 200% và RTL; ứng dụng hiện cung cấp VI/EN với hướng LTR.

## Giới hạn nghiệp vụ được giữ

Các request API, tham số lọc, UTC, bảo vệ phiên/quyền và xử lý dữ liệu đến muộn dùng cơ chế hiện có. Khóa/mở khóa tài khoản vẫn bị chặn theo trạng thái tích hợp hiện tại. Quản trị viên không được cấp quyền đọc nội dung kho hay xử lý bàn giao bởi thay đổi giao diện này.

Tài khoản Admin local được cấp riêng theo yêu cầu trực tiếp của người dùng. Thông tin đăng nhập lưu ngoài Git; không thêm tài khoản hoặc mật khẩu vào source hay migration.
