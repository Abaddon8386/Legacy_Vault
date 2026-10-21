# PS-98 / PS-96 — kiểm chứng BE–SQL thật 21/10/2026

## Phạm vi đã chạy

FE React tại `http://127.0.0.1:5207`, Spring Boot dev cổng 8080 từ worktree `LV-staff-evidence`; tích hợp develop `f07d69b` bằng merge `d54dfda`. SQL Server `ABADDON:1433`, DB thử nghiệm `LegacyVault_PS34_Local_20261014`. Flyway validate 41 migrations và áp dụng V40/V41 bằng cấu hình hiện hữu; không reset DB, sửa migration/khóa hoặc cấp role. Người dùng xác nhận quyền dùng tài khoản Staff thử nghiệm trong chat; không lưu credential ở đây.

Đã thao tác browser, không dùng fixture server:

1. Đăng nhập Staff → mở case từ danh sách → tiếp nhận bản ghi giấy tờ tử vong thử nghiệm kèm ảnh PNG tổng hợp.
2. Lưu metadata → upload → receipt thành công → mở attachment → xem nội dung qua BE → reload → mở lại được.
3. Chuyển nhóm di chúc gốc, tạo bản ghi và attachment thử nghiệm → đọc được, chuyển VI/EN, điều hướng/reload rồi mở lại và tải về.
4. Kiểm mobile 390×844: document scrollWidth=390; sau sửa class CSS, ảnh có chiều rộng khoảng 325px trong vùng preview rộng349px, không cuộn ngang/cắt ảnh. Desktop1440×1000.
5. File tải về có SHA-256 đúng file gốc và SQL: `4f78d33316d03d0bbaea805cbf97de6248cd0ec4e3fe78c6006ffa24e220a24e`.

File tổng hợp ghi rõ SYNTHETIC TEST / NO LEGAL VALUE; không phải giấy chứng tử/di chúc thật. Hai bản ghi thử còn trong DB, không thay/xóa giấy tờ cũ, không đưa case qua quyết định Legal/unlock.

## Đối chiếu SQL chỉ đọc

| Nhóm | Record public ID | Attachment public ID | Byte gốc | Ciphertext bytes |
| --- | --- | --- | --- | --- |
| Death document | c6f45c88-01db-4748-8435-0dcf75f64f68 | 3193acb3-1f7a-4ffa-a8f6-be18cb421d0f | 6184 | 6200 |
| Original will | c230a214-c64e-4808-86aa-86e8c982dc3d | ae07231c-7cef-45f2-8d30-6eede6bba218 | 6184 | 6200 |

Truy vấn join `staff_intake_attachments` với đúng subject record. Nội dung mã hóa không được xuất ra; file giải mã đọc/tải qua API khớp hash gốc. Đây là bằng chứng persistence/read round-trip, không phải kiểm toán mật mã độc lập.

## Metadata phân bổ: blocker thật còn lại

- Có API `GET /api/v1/staff/verification-cases/{caseId}/beneficiaries` (PS-88): danh sách người nhận theo quyền case. Không còn thiếu nguồn beneficiary; UI blocker đã sửa câu chữ để chỉ báo thiếu asset catalog.
- Chưa tìm thấy endpoint Staff đọc danh mục tài sản của case trước unlock trong controller/contract develop `f07d69b`. Staff case detail không chứa asset list; Legal context không cung cấp catalog Staff. Owner assets API thuộc quyền Owner, không được gọi thay bằng Staff.
- `GET .../handover-sessions/{sessionId}/eligible-assets` gọi HandoverAuthorizationGuard rồi resolve allocation của phiên bản đã duyệt; yêu cầu phiên và kho UNLOCKED/HANDOVER_IN_PROGRESS. Không dùng làm đầu vào intake trước approval/unlock.
- Intake BE yêu cầu các allocation gắn tài sản/người nhận hợp lệ. Cần BE bàn giao catalog metadata theo assigned case trước unlock (public asset ID và thông tin nhận diện tối thiểu được phép, không secret/blob/key), quyền/trạng thái/lỗi và contract tương thích intake. Ân chủ trì PS-102, phối hợp Dương phần asset/allocation. Đây là yêu cầu bàn giao, không tuyên bố endpoint mới đã tồn tại.
- Hồ sơ thử nghiệm `ab6e594d-ba69-405c-86ab-d54f38d8c897` hiện chưa có basis dossier; browser hiển thị chờ Legal. Người dùng chưa cung cấp tài khoản Legal, không dùng Staff để giả tạo dossier hoặc bỏ guard.

Do đó **chưa chạy intake/upload/forward hoặc preview file COURT thật**. PS-96 vẫn thiếu nghiệm thu; PR phải để draft, không đánh dấu Done/ready/merge. Phần preview COURT và race guards đã có test tự động; ảnh blocker là trạng thái thật, không phải bằng chứng forward thành công.

## Ảnh thật

- [Desktop: đọc attachment](desktop-attachment.jpg)
- [Mobile: đọc lại sau reload](mobile-attachment-reloaded.jpg)
- [Mobile EN: di chúc gốc](mobile-will-en.jpg)
- [Desktop: chưa có dossier](desktop-dossier-missing.jpg)
- [Desktop: chặn intake do thiếu catalog](desktop-allocation-blocker.jpg)
- [Mobile: cùng blocker](mobile-allocation-blocker.jpg)

Ảnh fixture của Anti không đưa vào bằng chứng BE–SQL này.

## Kiểm thử

Lint/build sau merge develop và sửa responsive: pass; có warning bundle lớn hiện hữu. Bộ test cuối: **1104/1104 pass, 27 suites, 0 fail/skip/cancel**, khoảng147giây. Bộ test đầu sau merge có một assertion cũ tìm mã ticket trong câu blocker; đã sửa thành thông báo thiếu danh mục tài sản và chạy lại đầy đủ. Test liên quan36/36 pass; git diff --check pass.
