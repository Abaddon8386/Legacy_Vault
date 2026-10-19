# Trang đích Admin — 19/10/2026

Đã tra Jira theo Admin/quản trị/ROLE_ADMIN và đọc PS-10, PS-11, PS-76, PS-77, PS-80. Chưa có ticket chốt màn quản trị người dùng, xem mọi kho hay quyền cấp gói cho Admin. PS-77 không cho mặc định Admin là người cấp gói; PS-80 chưa mở màn quản trị cấp gói. Audit không được sửa/xóa, kể cả Admin.

- Dùng auth hiện hữu; Admin thuần được đưa tới `/admin`, yêu cầu phiên hợp lệ và vai trò `ADMIN` từ `/auth/me`; preview không bỏ qua guard.
- Giữ ưu tiên vai trò đã có: Owner/Legal/Staff vẫn vào trang nghiệp vụ tương ứng nếu tài khoản đồng thời có các vai trò đó; Admin ưu tiên hơn Beneficiary.
- Trang Admin hiện chỉ có thông tin tài khoản, profile/edit, ngôn ngữ và đăng xuất. Không gọi API kho Owner/Staff/Legal, không giả số liệu thống kê và không thêm quyền backend.
- Profile/edit dùng menu Admin và có đường trở lại `/admin`. Reload vẫn xác minh phiên với backend.
- Quyền thao tác backend vẫn theo principal/authorities hiện hữu. Chức năng quản trị dữ liệu cần yêu cầu, API contract và phân quyền riêng trước khi triển khai.

Việc thay thông tin tài khoản thử chỉ thực hiện ở DB local theo yêu cầu trực tiếp; không lưu mật khẩu/hash/tài khoản demo vào source hoặc migration.
