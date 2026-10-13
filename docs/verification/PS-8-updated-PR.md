# PS-8 — cập nhật PR #17

Giữ commit gốc 52af30589374366fc48fe5cf41267922524ddd48 của Huy, tích hợp nền PS-7 cập nhật (PR #16, b54d891), phụ thuộc PS-6 PR #15. Không có BE/DB thay đổi.
Route/menu/session/Vault thật từ API; bỏ default Vault và Trustee note; Bearer/locale/abort và response strict/whitelist. 404/403/401 không bị che thành danh sách rỗng. Readiness lấy từ backend, không tự tính success. Beneficiary không cần account/contact, Trustee optional nhưng cần email/phone khi thêm. Không unlock/decrypt/Claim/OTP/percentage. Skip local giữ khi thêm Beneficiary; guard submit và clear stale data/form. DOB kiểm tra ngày lịch, nhãn/lỗi VI/EN; 401 callback đúng.
Bản đã review trước và thử lại 145 test/lint/build trên nền này. Browser cùng logic đã kiểm tra skip/add Trustee/add Beneficiary, ready, DMS, 403, 503 và POST 401 ở lượt trước; chưa E2E BE/SQL Server.
Merge #15 → #16 → #17, chỉ approve PR sau khi nền develop đã ổn định. Giữ nguyên tác giả commit gốc; không force-push hay tạo nhánh phụ remote.
