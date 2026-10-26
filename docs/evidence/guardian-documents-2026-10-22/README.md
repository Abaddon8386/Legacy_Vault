# Guardian và PDF/Word — kiểm chứng 22/10/2026

Repo `Abaddon8386/Legacy_Vault`, checkout chính, nhánh `feature/PS-96-fe-court-integration`. Đã đọc Jira PS-113/114 và contract hiện hữu. Tiếp tục diff có sẵn, không commit/push/merge/đổi Jira. Không sửa khóa, reset DB, sửa migration hoặc dữ liệu người dùng có sẵn.

## Chức năng FE

| Phạm vi | Code | Kiểm chứng |
|---|---|---|
| Người dưới 18 tuổi lưu bình thường; guardian là khuyến nghị | TrusteeBeneficiaryPage, RelatedPersonEditDialog | Test VI/EN và API thật tạo minor |
| Guardian thêm/thay thế/thu hồi/lịch sử, expectedRevision, đúng vault/beneficiary | GuardianPanel, guardianService | SQL tests, API create/replace/revoke/reload/stale; browser lưu guardian rồi reload đọc lại |
| Chọn PDF/DOC/DOCX khi thêm tài sản; retry upload không tạo lại asset đã lưu | AssetFormModal, AssetManagementPage | Component test POST asset 1 lần, upload lỗi rồi thử lại 2 lần; metadata đã lưu được khóa |
| List/upload/download/delete tài liệu riêng với ảnh và di chúc | AssetDocuments, assetDocumentService | API thật PDF/DOCX, tải xuống đúng byte/SHA-256, mật khẩu sai, file giả; SQL quota/atomic/ownership/delete và unit DOC/OLE |
| Không nhúng PDF/Word, password chỉ trong request, không log/storage; abort khi đổi context | Hai panel và service | Test pending guardian write, binary transport; browser tải Word sau nhập password |

File upload và metadata tạo tài sản là hai request theo API hiện hữu, không phải giao dịch atomic chung. Nếu upload thất bại, tài sản đã lưu được giữ; sửa metadata bị khóa và lần thử lại không tạo lại asset. Nếu đóng form thì quản lý tệp từ Chi tiết tài sản. Sau response upload không xác định, cần tải lại danh sách trước khi quyết định upload lại để tránh lặp tài liệu. Tài liệu chưa nằm trong payload bàn giao Beneficiary theo contract PS-114.

## Kết quả

- FE toàn bộ: **1175/1175**, 27 suites, 0 lỗi/bỏ qua. Log local ignored `frontend/codex-guardian-final-tests.log`.
- Lint/build/diff-check đạt; cảnh báo chunk lớn hiện hữu vẫn còn.
- BE bộ đầu **50/50**, 0 lỗi/bỏ qua: guardian policy/controller/SQL, asset document SQL, FourPr HTTP/SQL, Staff counter invitation SQL, handover session/delivery/close/receipt/archive và received-assets SQL. Log ignored `backend/codex-final-integration.log`.
- BE định dạng **5/5** (`AssetDocumentFileTest`), gồm DOC/OLE, DOCX/PDF, macro/malformed; log `backend/codex-doc-format-tests.log`.
- Thêm **1/1** `FinalCourtHandoverHttpSqlServerTest`: HTTP thật + SQL Server ở DB random do test tạo/dọn. Legal COURT review/decision → approval → unlock riêng → link tài khoản tại quầy → trước giao không có item → delivery → đọc đúng payload → confirmation → close → receipt → archive → Vault ARCHIVED/case CLOSED → vẫn đọc đúng item. Close sớm bị chặn, Staff không có quyền đọc received-assets. Log `backend/codex-final-http-flow.log`.
- Tổng các lệnh BE: **56 test đạt**, 0 bỏ qua. Đây là bộ liên quan, không phải toàn bộ mọi test BE.

## Bằng chứng thật

- `api-result.json`: ID dữ liệu tổng hợp mới, hash/kích thước PDF/DOCX và các bước đạt. Chạy bởi `scripts/testing/live-guardian-documents.mjs`, yêu cầu password từ biến môi trường, không ghi password/token vào evidence.
- `guardian-browser.png`: lưu guardian trên FE → BE → SQL, tải lại trang rồi đọc lại thành công.
- `documents-browser.png`: danh sách PDF/Word thật; trình duyệt đã gọi tải Word bằng mật khẩu. Ảnh không phải mock.
- PDF/DOCX đính kèm trong thư mục này chỉ là fixture tổng hợp, không có giá trị pháp lý. Lượt smoke đầu dừng vì giả định upload trả một item; contract thực tế trả toàn bộ danh sách. Đã sửa script và chạy đạt trên tài khoản synthetic thứ hai; không xóa hai tài khoản/record synthetic để che lịch sử.

## Giới hạn và runtime

- Backend đang chạy `localhost:8080` bằng `start-local.ps1` và cấu hình local hiện có; frontend `http://localhost:5194` proxy BE. Runtime khởi động thành công với SQL Server local.
- HTTP workflow test dùng ca tử vong và danh tính tại quầy đã được chuẩn bị bằng fixture trong DB thử riêng; không khẳng định kiểm chứng giấy tờ pháp lý hay gặp mặt vật lý. Intake file setup dùng service fixture; bước review/approve/unlock/link/deliver/confirm/close/receipt/archive/read dùng HTTP thật.
- Browser đã kiểm guardian và danh sách/tải tài liệu Owner. Chưa chạy trọn mọi màn Staff/Legal/Beneficiary bằng browser desktop/mobile; không lấy ca HTTP làm bằng chứng browser toàn luồng.
- Invitation transport trong bộ test là kiểm nghiệp vụ, không chứng minh thư đã tới hộp thư thật. VNPay/email provider chưa được cấu hình hoặc nghiệm thu thật trong task này. Không thanh toán, gửi mail thật hay thay quyền tài khoản hiện hữu.
- Không tuyên bố toàn bộ project hoặc mọi AC đã hoàn tất; chưa commit/PR/merge hoặc đổi trạng thái Jira.
