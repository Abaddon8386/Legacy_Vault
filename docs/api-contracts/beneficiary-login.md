# Đăng nhập Beneficiary — 19/10/2026

Cập nhật 20/10: [PS-86](beneficiary-invitations.md) có vòng đời mã mời và hàm consume
nội bộ nguyên tử cho PS-87. Không đổi route/login/portal trong PS-86, chưa mở API
nhận mã công khai. Policy dùng code possession, không email verification/OTP, không
early access; luồng quầy và các giới hạn quyền bên dưới tiếp tục áp dụng.

Nguồn Jira đã đọc: PS-52, PS-62, PS-63 (tài khoản được Staff tạo/liên kết tại quầy), PS-64–66 (phạm vi bàn giao và guard), PS-54 (Staff ghi nhận xác nhận). Không tạo Guest Portal, Claim Link hoặc OTP.

- Dùng chung `/login` và API auth hiện hữu. Nút “Về trang chủ” đưa về `/` (landing 3D).
- Giữ ưu tiên vai trò hiện tại: Owner → `/vault`; Legal không phải Owner → trang Legal; Staff không phải Owner/Legal → trang Staff. Beneficiary không có các vai trò trên → `/beneficiary`.
- `/beneficiary` chỉ dành cho phiên còn hạn có vai trò `BENEFICIARY` đã được xác minh qua `/auth/me`. Query preview không bỏ qua yêu cầu này.
- Trang đích chỉ hướng dẫn làm việc với Staff, liên kết hồ sơ cá nhân, chỉnh sửa hồ sơ và đăng xuất; không khẳng định đã xác minh/liên kết/bàn giao thành công.
- Chưa có contract API tự phục vụ cho Beneficiary xem tài sản hoặc tiến độ bàn giao trong checkout hiện tại. Trang không gọi API Owner/Staff/Legal hay dựng dữ liệu bàn giao. Tài khoản không mặc nhiên có quyền xem kho, giải mã hoặc tự xác nhận nhận tài sản.
- Profile/edit dùng menu Beneficiary và có đường quay về `/beneficiary`; quyền dữ liệu tiếp tục do backend kiểm tra. Không thay role hoặc API backend trong sửa đổi này.
