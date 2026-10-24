# Staff và Vault — giao diện và tương tác

## Phạm vi

- Gọn tiêu đề, bỏ mô tả lặp, thống nhất thẻ/nút/khoảng cách ở Staff và các màn quản lý kho.
- Viền vàng chạy quanh thẻ, spotlight theo con trỏ, focus bàn phím và reduced-motion; khôi phục chuyển động minh họa kho.
- Chọn nâng gói trực tiếp trên thẻ, hiển thị báo giá server trong hộp xác nhận; đóng hộp không tạo giao dịch.
- Thể hiện hạn mức tài sản + di chúc, khóa nút thêm khi hết hạn mức/chưa kiểm tra được quota; sửa biểu tượng đóng modal. Server vẫn quyết định quota.
- DMS hiển thị lý do khóa ngoài trạng thái MONITORING; menu chia sẻ theo vai trò; nhận diện đúng người thụ hưởng đã liên kết tài khoản.
- Staff hiển thị tên/mã hồ sơ, trạng thái phiên, lựa chọn phiên và lỗi có thể thử lại; giữ guard read-only và phân quyền hiện có.

## Tích hợp

Chuẩn bị trên develop sau PR #202. Giữ điều hướng Legal, cơ chế remount theo ngữ cảnh và các sửa hồi quy đã có trên develop. Chỉ thay đổi frontend; không kèm cấu hình chạy demo, dữ liệu, bí mật, backend, auth hoặc landing.

## Kiểm tra

- Phiên UI trước khi tách nhánh: 197 kiểm thử Staff đạt; các nhóm Owner liên quan đạt 48/48.
- Browser demo: Staff desktop 1440×960, mobile 390×844, VI/EN, xem hồ sơ/đính kèm/chọn người nhận, ca đóng chỉ đọc; Owner Vault kiểm tra spotlight 2px và không tràn ngang. Không tạo bản ghi bàn giao hay thanh toán.
- Bản PR riêng: ESLint, production build, diff-check và toàn bộ `npm test` đạt 1235/1235 (27 suites). Bài kiểm thử có máy chủ giả lập được chạy với quyền kết nối localhost.
- Build còn cảnh báo bundle lớn có sẵn. Metadata tùy chọn phụ thuộc API và quyền của tài khoản; không thay thế phản hồi nghiệp vụ được cấp quyền bằng dữ liệu minh họa.
