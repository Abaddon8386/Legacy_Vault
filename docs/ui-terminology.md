# Thuật ngữ giao diện Legal

Tên điều hướng, breadcrumb và tiêu đề lấy từ `frontend/src/utils/legalNavigation.js`.

| Khái niệm | Tên hiển thị tiếng Việt |
| --- | --- |
| Death verification | Xác minh tử vong |
| Will comparison | Đối chiếu di chúc |
| Basis classification | Thẩm định căn cứ |
| Dossier review | Thẩm định hồ sơ |
| Final approval | Phê duyệt hồ sơ |
| Controlled unlock | Mở khóa có kiểm soát |
| Verification case | Hồ sơ xác minh |
| Recipient origin | Căn cứ xác định người nhận |
| Technical identifiers, hashes, evidence references | Không hiển thị trên màn làm việc Legal |
| Save assessment or decision | Ghi nhận quyết định |
| Refresh selected record | Tải lại hồ sơ |

Trạng thái và thời gian không hiển thị trực tiếp enum/timestamp từ API. Các màn hình Legal dùng `legalPresentation.js`; thời gian theo `Asia/Ho_Chi_Minh`, ví dụ `23/10/2026, 01:23`.

Cập nhật 26/10/2026 theo yêu cầu người dùng: bỏ các khối “Chi tiết kỹ thuật”, UUID, mã băm và mã tham chiếu nội bộ khỏi Legal. Giữ số hồ sơ, số văn bản, bản tài liệu đang xem, tên tài sản/người nhận và kết quả xử lý. Kiểm tra tệp, quyền truy cập và dữ liệu gửi khi lưu vẫn do hệ thống thực hiện; không yêu cầu chuyên viên tự kiểm tra các giá trị kỹ thuật.

Thông báo cần nói việc gì chưa thực hiện được và người dùng nên làm gì tiếp theo. Dùng “Chưa tải được hồ sơ. Vui lòng thử lại sau.” thay cho “Backend/API chưa sẵn sàng”; dùng “Giấy tờ đã thay đổi, cần thẩm định lại” thay cho “stale/hash/snapshot”. Khi chưa biết nguyên nhân, hướng dẫn tải lại hoặc liên hệ người phụ trách, không tự nêu một giấy tờ còn thiếu.
