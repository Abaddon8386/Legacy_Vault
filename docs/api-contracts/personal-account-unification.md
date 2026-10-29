# Tài khoản cá nhân chung — 29/10/2026

Quyết định: Thái yêu cầu sửa khác biệt giữa tài khoản tự đăng ký và tài khoản Staff tạo tại quầy, tiếp nối PS-87/PS-105. Quyết định này thay phần chính sách cũ bắt tài khoản tại quầy không có quyền quản lý kho riêng. Không thay quy trình Legal, liên kết, xác minh tại quầy hoặc bàn giao.

## Mapping và tương thích

- Tự đăng ký và Staff tạo mới đều có `ROLE_VAULT_OWNER`: chỉ quản lý kho **của chính tài khoản**. Không tạo kho tự động, không thêm gói trả phí.
- Staff tạo tài khoản vẫn trả `linkStatus=UNLINKED`, chưa có `ROLE_BENEFICIARY`, chưa có quan hệ nhận và chưa được đọc tài sản người khác. Quyền Beneficiary chỉ được cấp qua thao tác liên kết hợp lệ hiện có.
- Tài khoản cũ chỉ có Beneficiary hoặc không có role được bổ sung Owner **từng tài khoản khi đăng nhập thành công**. Đọc lại role dưới khóa tài khoản trước khi thêm để tránh trùng khi đăng nhập đồng thời. Không có migration cấp quyền hàng loạt. Phiên cũ cần đăng xuất/đăng nhập lại để FE nhận mapping mới.
- Allowlist chỉ gồm tài khoản không role hoặc role duy nhất `ROLE_BENEFICIARY`; tài khoản Admin/Staff/Legal, kể cả hỗn hợp Beneficiary, và role không nhận diện không tự được bổ sung Owner. Tài khoản đã có Owner giữ nguyên quyền hiện hữu.
- Việc tương thích chạy tại phát hành phiên đăng nhập, không từ redeem/link hay bằng payload FE. Auth/JWT và `/auth/me` đọc role thật trong DB; FE không tự thêm role. Ghi audit thay đổi role, không ghi mật khẩu/token.
- Giữ các kiểm tra account ACTIVE/không bị xóa, mật khẩu, Google identity đã liên kết và cơ chế auth version. Không mở signup Google hoặc tự liên kết theo email.

## FE

- `/shared-with-me` là đường vào nhận di sản chung. `/beneficiary` cũ chuyển bằng replace, giữ query/ngôn ngữ; không render cổng thông tin Beneficiary riêng.
- Xóa component/CSS `BeneficiaryHome` không còn dùng và nhánh điều hướng nội bộ `beneficiary-home`; giữ kiểm thử chuyển hướng, phiên, API và quyền nhận trong workspace chung.
- Sidebar có đúng một mục nhận di sản, không có lựa chọn đổi cổng Beneficiary. Tài khoản có Owner thấy chức năng kho riêng và nhận di sản trong cùng shell.
- Phiên Bene-only/không role cũ vẫn vào Shared with me, không giả quyền Owner hoặc gọi API quản lý kho khi BE chưa trả quyền đó.
- Quyền đọc dữ liệu nhận vẫn theo principal–recipient–item DELIVERED; có Owner, mã mời hoặc liên kết không tự mở nội dung trước bàn giao. Giữ quyền lịch sử sau archive.

## Phạm vi bàn giao

Nhánh riêng từ develop, không chứa nhánh UI Anti hay nhánh tích hợp PR Legal. Không chạy migration/sửa dữ liệu hoặc thay dịch vụ của bản dev đang mở. Kiểm thử dùng unit/component mock cần ghi rõ, không coi là E2E với SQL Server thật.
