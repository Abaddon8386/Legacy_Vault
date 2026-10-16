# PS-7 — cập nhật PR #16

Giữ commit gốc 8f49003f1e0cfd077b2c00c1d9d3d44725c26d27 của Huy, tích hợp nền PS-6 đã cập nhật (PR #15, 1fd1a77). Không có PS-8.
Upload route/menu/session/Vault, API_BASE/Bearer/locale, multipart/progress, response 201 UPLOADED với metadata/hash đúng và whitelist. Không Legal Approved hoặc phiên bản mới. Thông tin kỹ thuật và SHA-256 không hiển thị trên UI; hash chỉ xác minh nội bộ. Callback 401 được nối đúng; form/file/note xóa khi logout/403/404 và abort khi rời màn.
Bản sửa được người dùng review trước; đã kiểm tra lại 123 test/lint/build trên nền tích hợp. Browser upload/VI/EN/401 của cùng logic có bằng chứng ở lượt trước; chưa BE/DB thật.
PR này có phụ thuộc PS-6. Merge PR #15 trước, đợi GitHub cập nhật nền và review/approve #16 sau đó. Không tự merge develop hoặc đổi Jira.
