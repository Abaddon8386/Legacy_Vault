# PS-99–101 — Frontend tích hợp API Legal

Ngày kiểm tra: 2026-10-21. Nền: develop `d3cd2e5` (đã merge Admin #176).

## Thay đổi

- Default Legal workflow gọi GET `/api/v1/legal-verifications/verification-cases` với phân trang server; không còn phụ thuộc callback discovery được cấp từ bên ngoài App.
- GET `/{caseId}/context` cấp danh sách giấy tờ, snapshot và capabilities thật. Deep link tới hồ sơ ngoài trang danh sách hiện tại vẫn được kiểm tra bằng context endpoint, không suy quyền từ vị trí trong danh sách.
- Phê duyệt/từ chối dùng POST `/{caseId}/basis-dossier/decision`; gửi đúng version/hash/allocation hash đã hiển thị. Từ chối cần lý do.
- Mở khóa có xác nhận riêng, dùng POST `/{caseId}/unlock`, không gộp với phê duyệt và không truyền actor/role/snapshot tự chế trong body.
- Trước hai mutation cuối, đọc lại context và so sánh trạng thái/snapshot/capabilities với bản đã hiển thị. Bỏ qua evaluatedAt khi so sánh vì mỗi GET có thời điểm mới. Thay đổi hoặc 409 yêu cầu tải lại; không thay hash mới vào một quyết định cho dữ liệu cũ.
- Chống gửi trùng, hủy/bỏ response khi rời trang/đổi hồ sơ/phiên; revalidation danh sách hoặc context 403 không giữ form cũ. Receipt hợp lệ không tự cấp quyền thao tác tiếp; cần reload.
- Giữ COURT-only: phân loại COURT/ON_HOLD sau death verification, không yêu cầu di chúc hoặc MATCH giả. Legacy NOTARIAL chỉ đọc; không chuyển đổi lịch sử.
- Không sửa BE, migration, dữ liệu nghiệp vụ, quyền đọc secret hoặc file tài sản. Các callback injection còn lại là boundary kiểm thử; default runtime dùng HTTP API.

## Kiểm tra

- `npm test`: 1.047/1.047 đạt.
- `npm run lint`: đạt, không lỗi.
- `npm run build`: đạt; vẫn có cảnh báo kích thước bundle hiện hữu.
- `git diff --check`: đạt.
- Test mới kiểm tra contract queue/context, UUID và snapshot sai, approval/rejection, controlled unlock riêng, thay đổi SHA/allocation/dispute/court state, lỗi mutation, stale response, queue 403, phân trang, COURT không có di chúc và route App thật không truyền callback.
- Fixture HTTP chỉ nằm trong test, không được import vào ứng dụng và không phải chứng từ pháp lý thật.

## Giới hạn bằng chứng

Đã kiểm tra component/App qua JSDOM và fixture contract. Chưa chạy browser với BE/SQL Server và hồ sơ pháp lý thật; không tuyên bố đã kiểm chứng việc gặp mặt, phê duyệt thực tế hoặc mở khóa thực tế. Backend tiếp tục là nơi kiểm tra quyền, snapshot, điều kiện và transaction cuối cùng.
