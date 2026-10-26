# PS-94 — Nối tiếp nhận hồ sơ staff (bàn giao từng phần)

Repo: Abaddon8386/Legacy_Vault. Base develop c69b7eb. Nhánh feature/PS-94-staff-live-integration; worktree staff-live độc lập với nhánh DMS của Anti.

## Đã nối

- Queue thật mở trang tiếp nhận theo UUID case, desktop/mobile; query caseId giữ tham chiếu khi reload, quay lại xóa tham chiếu.
- GET case detail, POST claim; không dùng kết quả claim giả hay tự gán người phụ trách.
- GET/POST death-documents và original-will-intakes. Field bám RecordDeathDocumentRequest/RecordOriginalWillRequest; receivedBy/receivedAt chỉ đọc từ server.
- Tải bản ghi được phép trước khi mở form; server vẫn kiểm tra từng mutation. Giữ bản nháp riêng theo nhóm giấy tờ và khi đổi VI/EN; chỉ xóa sau receipt hợp lệ.
- Thanh chờ pending, khóa gửi trùng, abort khi rời trang/session, lỗi API không fallback mock. Receipt khác case/malformed bị từ chối.

## Chưa hoàn tất / phụ thuộc

- Chọn trustee và beneficiary để liên hệ/xác minh cần read context PS-93; không dùng API Owner hoặc yêu cầu nhập UUID thủ công.
- Tại quầy là PS-95/PS-88; căn cứ pháp lý và completion là PS-96/PS-97, không nằm trong diff này.
- Chưa nghiệm thu E2E hoặc browser với SQL Server: cổng localhost:8080 không hoạt động lúc kiểm tra. Không có bằng chứng persistence thật hoặc hình browser trong lần bàn giao này.
- Quyền sửa chi tiết do BE kiểm tra; response case hiện chưa có capability/assignment nên UI không suy đoán quyền từ OPEN. API từ chối sẽ giữ dữ liệu nhập.

## Kiểm thử

- 10 test mới: service endpoint/method/status/auth/locale/signal/field whitelist/receipt/errors; component pending, chống gửi trùng, bản nháp VI/EN, lỗi và abort mutation.
- Dashboard: 24/24, gồm route live mới và hồi quy preview.
- Lint và production build đạt; build còn cảnh báo chunk lớn vốn có.
- Toàn bộ FE: 774/774 đạt, 0 fail/skip; sau bổ sung khóa form khi lỗi quyền, chạy lại 10 test mới, lint/build đều đạt. Log frontend/staff-tests-final.log (file local bị ignore).

## Chạy thử khi BE đã hoạt động

Tại frontend trong worktree này: npm.cmd run dev -- --host localhost --port 5195 --strictPort. Vite proxy mặc định localhost:8080. Mở /staff/cases, đăng nhập Staff, chọn hồ sơ, nhận nếu chưa giao, tải bản ghi rồi nhập giấy tờ; dùng database test. BE phải cho phép CORS origin 5195 nếu môi trường không đi qua proxy.

Chưa commit/push/PR, chưa đổi trạng thái Jira. Không sửa file DMS của Anti.
