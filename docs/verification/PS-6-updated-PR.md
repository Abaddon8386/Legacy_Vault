# PS-6 — cập nhật PR #15

Nguồn PS-6 gốc: 12bea39d6121c0886475d9c674d9c1bd453bcf2a; giữ trong lịch sử.
Develop sau PR #11: efa2c8548ea00b3b9dc61f6f47e073e140ca8e48. Xác minh không có commit sửa PS-5 8b66512, nên phục hồi các prerequisite đã review bằng merge, không viết lại tác giả/ngày/commit.
Giải quyết xung đột AssetListTable/assetService bằng bản PS-6 đã review: HTTP/Bearer/locale/abort, response whitelist/UUID/Vault guard, detail mới từ API, PATCH metadata/payload chỉ ghi, 401 logout và 403/404 clear dữ liệu cũ, submit guard và form reset.
Không đưa PS-7/8 vào PR này. API fixture 18176, không BE/DB thật. Bản chuẩn bị có cùng logic PS-6 đã kiểm thử UI ở lượt trước; kiểm tra lại 117 test/lint/build trên nền merge hiện tại.
Người dùng đã yêu cầu cập nhật nhánh/PR Huy, không tạo nhánh phụ remote; không tự merge vào develop hoặc đổi Jira.
