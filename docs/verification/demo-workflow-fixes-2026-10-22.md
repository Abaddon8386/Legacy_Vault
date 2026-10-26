# Kiểm tra luồng demo 2026-10-22

Base: develop `7fa2596`. Nhánh: `fix/demo-workflow-blockers`.

## Lỗi tái hiện và sửa

- Tiến độ luôn chưa xác định dù API trả số lượng hoàn tất: ánh xạ đúng `total/delivered/confirmed`; bỏ trạng thái cũ khi đổi phiên hoặc ngữ cảnh xác thực.
- Danh sách bàn giao thiếu tên tài sản/người nhận: thêm hai trường tên vào DTO hiện có từ truy vấn phạm vi được cấp quyền, không mở quyền endpoint danh mục trước mở khóa.
- Trang bàn giao trực tiếp lặp nút chọn tài sản: giữ một nút theo phiên đang chọn.
- Trang đóng/lưu trữ: đọc trạng thái kho từ API và hiển thị tên người nhận khi lập biên bản; lịch sử sau lưu trữ vẫn có thể dùng ID nếu API không trả tên.
- Danh sách bàn giao sai cấu trúc được báo lỗi thay vì coi là danh sách rỗng hợp lệ.

## Demo thực tế

Chỉ dùng DB riêng `LegacyVault_Demo_Project`, không sửa DB ứng dụng. Dùng tài khoản demo Staff/Legal hiện có.

Hồ sơ có sẵn HS-2026-000001 được thực hiện qua UI: xem PDF căn cứ → Legal xác nhận căn cứ, thẩm định, phê duyệt, mở khóa → Staff tạo phiên → xác minh tại quầy → bàn giao → xác nhận nhận → xem tiến độ 1/1 và 1/1 → đóng phiên → lập biên bản → lưu trữ.

Hồ sơ chỉ phân bổ một tài sản cho một người nhận; 1/1 là số liệu thật của phạm vi này. Tạo tài khoản nhận tổng hợp riêng và liên kết qua API hiện có. Sau lưu trữ, đăng nhập tài khoản đó, mở Được chia sẻ với tôi và đọc được nội dung bằng mật khẩu.

DB demo hiện giữ kết quả CLOSED / COMPLETED / ARCHIVED; không xóa lịch sử để chạy lại. Không đưa nhánh Resend #197 bị từ chối vào thay đổi.

## Kiểm tra

- BE: 17 test đạt, gồm HTTP + SQL Server toàn luồng trên DB fixture riêng.
- FE: 110/110 test liên quan tiến độ, đóng/lưu trữ, bàn giao trực tiếp, phạm vi và review Staff đạt. Cập nhật mock đếm request cũ theo các endpoint đọc bổ sung trên develop.
- ESLint bốn trang thay đổi đạt. Production build đạt, còn cảnh báo kích thước bundle hiện có.
- Không chạy toàn bộ suite. Chưa xác minh lại Google, thanh toán, email gửi thật hoặc toàn bộ luồng Owner ở lần kiểm tra này.
