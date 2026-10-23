# Tiến độ nâng cấp UI/UX Legal

## Phạm vi hiện tại

- Thư mục: `E:\Legacy_Vault\Legacy_Vault`.
- Nhánh: `feat/legal-ui-refresh`, tạo từ `origin/develop` tại `dce65e7` (đã merge giao diện đăng nhập/đăng ký mới).
- Phạm vi: sáu màn hình Legal khi đăng nhập bằng tài khoản pháp lý. Không thay đổi backend hoặc hợp đồng API.
- Hai thay đổi cục bộ của Staff đã được bỏ theo yêu cầu mới của người dùng; bản sao còn trong `work/legal-ui-backup/`.

## Đã xong

- Dùng palette và font token chung: xanh rừng `#164639`, xanh đậm `#0c2b22`, vàng `#c5a059`, nền kem `#f7f5f0`, trắng `#ffffff`. Font sans cho nội dung; font serif token cho tiêu đề, đồng bộ trang auth.
- Bố cục tiêu đề, biểu tượng giấy tờ, tổng quan sáu bước, khu vực chọn hồ sơ và khu vực kết luận. Thanh bước chỉ đánh dấu **bước đang xem**, không suy đoán hồ sơ đã hoàn tất các bước trước.
- Menu, breadcrumb, tiêu đề dùng cùng tên từ `frontend/src/utils/legalNavigation.js`.
- Viền vàng khi hover/focus; hỗ trợ reduced motion. Nút tải lại trên shell Legal có nhãn.
- Thời gian theo Việt Nam, trạng thái thân thiện và lý do chặn được ánh xạ tại `frontend/src/pages/legal/legalPresentation.js`.
- Thông tin hồ sơ thành bảng hai cột; mã/hash/tham chiếu vào mục thu gọn có nút sao chép tại `frontend/src/pages/legal/LegalRecordDetails.jsx`.
- Giải thích nút chưa sử dụng được; liên kết tới bước cần xử lý trong màn hình phê duyệt/mở khóa.
- Hồ sơ đóng/lưu trữ và giai đoạn Legal đã kết thúc: chỉ xem, ẩn form chỉnh sửa. Vẫn có thể chọn giấy tờ để tra cứu tệp.
- Hộp xác nhận phê duyệt/từ chối/mở khóa nêu hồ sơ, phiên bản và hậu quả; nút từ chối màu nguy hiểm. Hủy giữ nguyên nội dung đang nhập.
- Giữ việc đọc lại hồ sơ trước gửi quyết định, chặn dữ liệu thay đổi, chống gửi trùng và kiểm tra quyền như trước.

## File triển khai

- `frontend/src/pages/legal/LegalLiveWorkflow.jsx` và `.css`: bốn bước xác minh/thẩm định và bố cục chung.
- `frontend/src/pages/legal/LegalFinalDecision.jsx`: phê duyệt, mở khóa, chỉ xem và xác nhận.
- `frontend/src/pages/legal/LegalEvidenceFiles.jsx`: thời gian tệp.
- `frontend/src/components/layout/AppShell.jsx` và `.css`: nhãn tải lại riêng Legal.
- `frontend/src/utils/legal*test.mjs`: kiểm thử luồng, xác nhận, trạng thái đóng và định dạng.
- `frontend/src/utils/staffAppIntegration.test.mjs`: sửa assertion URL bàn giao cũ cho khớp `/staff/handover` đã có trên develop; không thay đổi logic Staff.

## Kiểm tra bằng tay

1. Chạy frontend, đăng nhập tài khoản có quyền Legal. Mở `/legal/death-verification`, chọn hồ sơ rồi chọn giấy tờ; kiểm tra cơ quan cấp, số giấy tờ, ngày cấp, xem tệp và lý do trước khi ghi nhận.
2. Mở **Đối chiếu di chúc**: chọn bản gốc để xem tệp, chọn bản di chúc số và kết quả đối chiếu. Hash nằm trong Chi tiết kỹ thuật.
3. Mở **Thẩm định căn cứ**, **Thẩm định hồ sơ**: kiểm tra phiên bản, ngày chuyển, tệp và thông báo thiếu điều kiện. Trạng thái tạm dừng không được cấp thêm quyền.
4. Mở **Phê duyệt hồ sơ**: thử chọn từ chối và nhập lý do trên hồ sơ thử nghiệm, mở hộp xác nhận rồi chọn Quay lại kiểm tra. Nội dung phải còn nguyên; chưa có quyết định được gửi.
5. Mở **Mở khóa có kiểm soát**: hồ sơ chưa phê duyệt phải có lý do và liên kết tới bước phê duyệt. Hồ sơ đủ điều kiện vẫn cần đánh dấu xác nhận và qua hộp xác nhận riêng.
6. Mở hồ sơ đã đóng/lưu trữ: thông tin còn để tra cứu, không còn form ghi quyết định.
7. Thử tiếng Việt/Anh, bàn phím Tab/Escape, màn hình 390px; kiểm tra nhãn nút, focus, bảng thông tin và modal không tràn ngang.

## Xác minh và giới hạn

- Đã kiểm tra trực quan desktop và mobile 390px với dữ liệu giả lập; không gửi quyết định pháp lý trên hồ sơ thật.
- Các trang preview cũ là fixture riêng; đánh giá nghiệp vụ cần đăng nhập để đi qua `LegalLiveWorkflow` thực tế.
- Build vẫn có cảnh báo kích thước bundle lớn của dự án; cần tách bundle trong một công việc hiệu năng riêng.
- `npm run build`: đạt; `npm run lint`: đạt; `npm test`: 1.203/1.203 đạt (chạy ngoài sandbox vì kiểm thử máy chủ cục bộ cần kết nối loopback).

## Tiếp theo

- Người phụ trách nghiệm thu theo checklist trên với dữ liệu thử nghiệm của hệ thống. Không push hoặc deploy trong công việc này.
