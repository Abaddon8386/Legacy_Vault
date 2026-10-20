# PS-95 — Nối phiên bàn giao thật, phần độc lập với PS-88

## Nguồn và checkout

- Jira đọc ngày 20/10/2026: PS-95 và PS-88 (cả hai To Do). Không thay đổi trạng thái Jira.
- Repo Abaddon8386/Legacy_Vault. Bản đầu từ c69b7eb; đã tích hợp origin/develop 9322c5d (gồm PR #152/#153 đã merge) trước khi tạo PR. Áp lại thay đổi không có conflict.
- Nhánh feature/PS-95-live-handover-session, worktree ps95-live; không thay đổi nhánh DMS hoặc PS-94.
- Contract: docs/api-contracts/handover-sessions.md; controller/service/dto HandoverSession của BE hiện có. Không sửa BE hoặc tự đặt endpoint.

## Đã triển khai

- Live CounterHandoverPage và BeneficiaryAccountPage tách khỏi preview; production/phiên có token không vào màn mô phỏng.
- Chọn case từ queue thật có phân trang, không nhập UUID thủ công. BE chỉ cho đọc phiên của hồ sơ đã giao cho Staff; hồ sơ chưa nhận được hướng dẫn về queue, không bypass claim.
- GET danh sách phiên, GET chi tiết; POST mở phiên nhận 201, PATCH hủy với body duy nhất status=CANCELLED sau xác nhận. Không gửi COMPLETED; close/completion thuộc PS-97.
- Trạng thái thật OPEN/COMPLETED/CANCELLED, không biến OPEN thành ACTIVE theo schema mock cũ. UUID, case/session, status, timestamp và receipt được kiểm tra; không xác nhận thành công từ dữ liệu giả/malformed.
- Không mở trùng khi đã có OPEN, khóa đồng bộ request trước khi React render. Race 409 yêu cầu tải lại; lỗi mạng/response không rõ không tự retry POST. Server vẫn quyết định quyền, kho UNLOCKED/HANDOVER_IN_PROGRESS, approval hiện hành và ON_HOLD.
- Query caseId/sessionId giữ ngữ cảnh khi reload, đi sang tài khoản tại quầy và quay lại. Màn asset-handover có link về phiên với ngữ cảnh, nhưng nghiệp vụ bàn giao tiếp theo vẫn thuộc PS-97.
- VI/EN, CSS riêng responsive; abort đọc/ghi khi đổi case, token hoặc unmount; bỏ response đến muộn và thông báo logout khi 401. Không lưu token/người nhận vào bộ nhớ bền mới.

## Chờ PS-88 — chưa hoàn tất toàn bộ PS-95

Thiếu contract/API read được phép cho danh sách beneficiary theo case, thông tin xác minh VERIFIED_AT_COUNTER, invitation/account và trạng thái workflow cần cho màn tài khoản. Vì vậy live account actions hiện bị khóa và có thông báo PS-88, không điền beneficiary giả hay gọi API Owner.

Mutation account-link/account đã có trong beneficiaryAccountService và được giữ nguyên. Sau PS-88, FE phải nối dữ liệu thật vào form hiện có, giữ cleanup mật khẩu, guard Legal/session/identity, account đã liên kết, race invitation-vs-counter và hướng dẫn offline. Việc cấp tài khoản không cấp quyền nhận tài sản sớm. Không tạo tài khoản cho người nhận chọn offline; vẫn phải có bằng chứng theo quy trình.

Các guard tiền điều kiện chi tiết chưa có trong read DTO không được FE tự gán true. Nút yêu cầu mở phiên chỉ gửi yêu cầu để BE kiểm tra, không phải xác nhận mọi điều kiện đã đạt.

## Kiểm thử và giới hạn

- Bản đầu: 783/783 đạt. Sau tích hợp develop 9322c5d: toàn bộ FE 807/807 đạt, 33 suites, 0 fail/skip (frontend/ps95-pre-pr-tests.log, local ignored); lint/build/diff-check đạt.
- 19 test mới (13 service, 6 component): endpoint/method/body/auth/locale/signal, receipt/UUID lỗi, 401/403/404/409, duplicate OPEN, giữ query, mở phiên pending chống trùng, restore, hủy có xác nhận, closed readonly, VI/EN, đổi case/unmount abort, offline/account gate.
- Nhóm PS-95 + hồi quy PS-51/52 preview: 27/27 đạt. Hai test production cũ cập nhật để kiểm tra live gọi API thật khi BE lỗi, không render dữ liệu tổng hợp; không bỏ kiểm tra production gate.
- npm.cmd run lint và npm.cmd run build đạt. Cảnh báo chunk >500kB vốn có.
- localhost:8080 không hoạt động khi kiểm tra. Chưa có E2E lưu SQL Server thật.
- Thử browser với fixture tách riêng (nhãn synthetic, không lưu DB) trên localhost:5196: công cụ báo ERR_CONNECTION_TIMED_OUT. Không có ảnh browser bàn giao. Hai file fixture tạm đã xóa, Vite kiểm tra đã dừng; fixture không nằm trong diff.

## Chạy thử

Khởi động BE bằng cấu hình local hiện có ở môi trường của người kiểm tra. Tại frontend của worktree ps95-live chạy npm.cmd run dev -- --host localhost --port 5195 --strictPort (proxy /api mặc định localhost:8080).

Đăng nhập Staff, mở /staff/cases và chọn Phiên bàn giao tại quầy. Chọn hồ sơ đã được giao, tải phiên hiện có hoặc yêu cầu mở phiên sau khi Legal hoàn tất điều kiện. Đối chiếu receipt trên DB test. Kiểm tra chuyển tài khoản tại quầy/reload/đổi ngôn ngữ/quay lại, hủy phiên, race 409 và hết hạn phiên. Link màn tài sản chỉ giữ context; chưa đại diện PS-97 đã tích hợp.

Chuẩn bị commit/push/PR theo yêu cầu ngày 20/10/2026. Đây là phần API sẵn có của PS-95; không đánh dấu ticket Done và không tự merge. Bản sao an toàn trước tích hợp develop: stash 96bc46315a62477ac52511fae1560e876af1ceea.
