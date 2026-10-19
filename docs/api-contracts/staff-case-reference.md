# Mã hồ sơ xác minh — cập nhật 19/10/2026

Theo yêu cầu người dùng, response danh sách, chi tiết và nhận xử lý hồ sơ tại
`/api/v1/staff/verification-cases` bổ sung `caseNumber`, ví dụ `HS-2026-000123`.

- `caseId` vẫn là UUID dùng trong URL, liên kết và kiểm tra quyền. Không thay UUID bằng mã hiển thị trong API request.
- `caseNumber` được backend tính từ năm UTC của `created_at` và `verification_case_id` đã lưu trong SQL Server. Hai trường này cố định; không sinh từ thứ tự dòng, số trang hay thời gian truy cập.
- Phần số có tối thiểu 6 chữ số; số lớn hơn 999999 không bị cắt. Số tăng theo identity toàn bảng, không đặt lại mỗi năm và có thể có khoảng trống.
- Hồ sơ cũ tự có mã dựa trên dữ liệu hiện hữu; không cần migration, backfill hoặc thay UUID. Không dùng mã này như một bí mật hay thay authorization.
- FE hiển thị mã do backend trả về; tạm tương thích response cũ chưa có trường này bằng UUID. Cần khởi động lại backend để có response mới.
