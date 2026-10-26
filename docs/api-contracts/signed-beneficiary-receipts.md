# Biên nhận đã ký tại quầy — 26/10/2026

Quyết định người dùng: xác nhận mới bắt buộc có toàn bộ biên nhận đã ký và Staff xác nhận đã đối chiếu. Mã do BE sinh; số giấy bên ngoài là tùy chọn. Không tự xác nhận chữ ký bằng ảnh.

## Ghi nhận
POST `/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/beneficiaries/{beneficiaryId}/confirmation`
Content-Type: multipart/form-data; `file` (PDF/JPEG/PNG, không rỗng, tối đa 10 MiB, kiểm tra magic bytes), `attested=true`, `paperReference` tùy chọn tối đa 200 ký tự.

JSON cũ không còn tạo được xác nhận mới. Giữ nguyên điều kiện Staff phụ trách ca, phiên OPEN, scope/version hiện hành đã duyệt và toàn bộ tài sản của người nhận đã DELIVERED. File được mã hóa AES-GCM gắn UUID bản ghi, lưu cùng transaction với confirmation/audit; không cập nhật bản ghi bất biến sau insert. BE sinh BN-UUID ổn định theo phiên/người nhận để retry không tạo trùng; file khác trên cùng bản ghi trả conflict.

Response thêm `hasSignedFile`; giữ `confirmationId`, `sessionId`, `beneficiaryId`, `status`, `confirmedBy`, `confirmedAt`, `receiptReference`. `paperReference` không thay mã hệ thống.

## Xem lại
GET `/api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/beneficiary-confirmations/{confirmationId}/file` chỉ Staff phụ trách đúng ca/phiên. Cho phép đọc sau đóng/lưu trữ. Tệp trả attachment, no-store, nosniff, có audit đọc; không trả đường dẫn nội bộ.

V53 thêm các cột nullable để giữ lịch sử: bản ghi cũ không có file được hiển thị rõ, không tự tạo chứng cứ. Mới bắt buộc có tệp qua API multipart.
