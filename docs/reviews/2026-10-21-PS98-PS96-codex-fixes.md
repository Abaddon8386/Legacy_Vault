# Codex sửa sau review PS-98/PS-96 — 21/10/2026

> Cập nhật vòng kiểm thật tiếp theo: đã chạy Staff upload/read/reload/download cho giấy tờ tử vong và di chúc bằng browser–BE–SQL, đối chiếu hash và ciphertext, ảnh desktop/mobile. Xem [bằng chứng hiện hành](../evidence/ps98-ps96-live-2026-10-21/README.md). Giới hạn “chưa kiểm browser Staff” ở phần lịch sử bên dưới đã được thay thế; PS-96 COURT intake/forward vẫn bị chặn vì thiếu catalog tài sản và chưa có dossier Legal. Không coi toàn bộ PS-96 đã hoàn tất.

Checkout: `C:/Users/hai/Downloads/FALL26/SWP/LV-staff-evidence`; remote `Abaddon8386/Legacy_Vault`, nhánh `feature/PS-98-96-staff-evidence-integration`, base `5283c61`. Giữ thay đổi Anti, không sửa BE hoặc checkout chính, không commit/push/PR/Jira.

## Đã sửa

- Attachment list/upload/read có controller, hủy khi đổi nhóm/rời màn; case/token đổi remount scope. Response muộn không tạo modal hoặc cập nhật nhầm dữ liệu. Chặn upload/preview trùng bằng khóa ref; xử lý 401 và khóa upload sau 401/403/404. Cleanup controller không còn chạy mỗi lần modal đổi.
- COURT preview có signal và cleanup theo case/token/unmount, bỏ response muộn; modal cũ không đi theo hồ sơ mới.
- File staging xóa khi đổi nhóm, không giữ file hợp lệ cũ sau khi chọn file không hợp lệ. Metadata lưu xong chuyển ownership file sang record đã lưu; upload lỗi chỉ retry attachment, không tái gắn vào record tạo tiếp.
- Receipt kiểm SHA-256 hex, MIME được hỗ trợ và sizeBytes nguyên dương; fixture/test dùng sizeBytes đúng DTO BE. Không đổi endpoint hoặc giới hạn nghiệp vụ.
- Báo cáo Anti đã được đính chính ngay đầu: ảnh cũ là fixture, reload Map không phải persistence SQL. Không dùng các ô “Đạt” cũ để nghiệm thu E2E.

## Test hành vi bổ sung

Account switch khi read pending, COURT case switch khi preview pending, đổi nhóm khi có file staging, metadata-success/upload-failure/retry/tạo record tiếp, lỗi 401 khóa upload, double submit và abort upload khi đổi nhóm, receipt nonhex/sai MIME/size và UI hiển thị dung lượng.

Toàn bộ FE: **1076/1076 pass**, 27 suites, 0 fail/skip/cancel, khoảng 114 giây. Test liên quan trước case double-submit cuối: 38/38 pass; chạy riêng component sau bổ sung cuối: 9/9 pass. Lint và production build pass (cảnh báo bundle lớn hiện có); git diff --check pass.

## Chưa nghiệm thu, không phải code đã hoàn tất toàn flow

1. Chưa chạy lại browser với tài khoản Staff được phép và BE–SQL thật. Bằng chứng Anti là fixture. Tài khoản Staff cũ từng bị auto-review từ chối vì chưa xác nhận quyền sử dụng; không thử lại hoặc cấp role/reset DB để vượt hạn chế.
2. PS-96 upload phiên bản COURT mới vẫn chờ nguồn metadata tài sản/phân bổ hợp lệ trước unlock ở bản nền đang xét. Không bỏ guard, không giả allocation. Phần đọc file/forward độc lập có thể kiểm tra khi có dossier hợp lệ; không báo toàn bộ PS-96 đã xong.

Quy trình kiểm chứng còn lại: Staff được phép → nhận case → metadata → upload → đọc lại → reload; Legal tạo dossier hợp lệ → intake COURT với allocation từ nguồn được BE cho phép → forward đúng version → reload; chụp desktop/mobile và ghi receipt/network đã che thông tin nhạy cảm.
