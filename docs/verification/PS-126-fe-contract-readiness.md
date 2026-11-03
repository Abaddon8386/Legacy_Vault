# PS-126 — chuẩn bị tích hợp FE Staff / Ban Pháp lý

Ngày: 03/11/2026. Nền: `develop` tại `09be0c1`, đã có PR #260 tại `0a0f1e4` và các cập nhật #259, #261–#263.

Theo yêu cầu tạm gác môi trường BE, phạm vi lần này là kiểm tra kết nối giữa các component và adapter FE hiện có. Không sửa code BE, migration, API hoặc dữ liệu demo. Đây **không phải báo cáo nghiệm thu E2E UI/API/SQL thật**; PS-126 chưa đủ bằng chứng để đánh dấu hoàn tất.

## Các điểm kết nối đã có

FE gọi qua proxy `/api/v1`. Khi có BE chạy được, cấu hình `API_PROXY_TARGET` bên ngoài Git để trỏ đến URL đó; không đặt mật khẩu hoặc khóa bí mật trong biến `VITE_*`.

| Giao diện | Adapter / API đang dùng | Dữ liệu quan trọng |
|---|---|---|
| Staff ghi nhận có mặt | `groupHandoverService.js`, GET/POST `/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover[/attendance]` | GET có `state`, `snapshot`, `requiredRecipientIds`, `attendance`, `deliveryAllowed`; POST có `expectedRevision`, `presentRecipientIds`, `reason` |
| Staff đề nghị mở lại | POST cùng gốc Staff + `/reopen-requests` | `expectedRevision`, `reason`; không có quyết định Legal trong body |
| Legal tìm yêu cầu hiện hành | `legalGroupHandoverService.js`, GET `/legal-verifications/group-handover/reopen-requests?caseId=&page=&size=` | Page envelope, `requestId`, `sessionId`, `revision`, tên kho/người gửi, số người/tài sản; lọc theo hồ sơ không phụ thuộc trang đầu |
| Legal xem chi tiết/lịch sử | GET cùng gốc `/legal-verifications/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover`, thêm `/events` cho lịch sử | `attendance.recordedBy`, `reason`, `request`, `lastDecision`, `capabilities.canDecide`; tên người nhận từ `distribution-workflow` cùng hồ sơ |
| Legal quyết định | POST cùng gốc Legal + `/reopen-requests/{requestId}/decision` | `expectedRevision`, `decision: APPROVE/REJECT`, `reason`; đọc lại trạng thái sau khi lưu |

Mỗi lệnh ghi dùng `Idempotency-Key` UUID. Máy chủ xác định người thao tác, thời điểm, phạm vi và quyền; FE không gửi các trường đó thay máy chủ. Receipt phải khớp hồ sơ/phiên và tăng revision đúng một lần. `notification: null` không ngăn xác nhận nghiệp vụ đã lưu nhưng không được hiểu là đã ghi nhận thông báo. Receipt hợp lệ với workspace nhận và `status: RECORDED` chỉ xác nhận đã ghi nhận, chưa chứng minh đã gửi hoặc đã đọc.

Contract chi tiết: [PS-119/120](../api-contracts/PS-119-120-group-handover.md), [PS-122](../api-contracts/PS-122-group-handover-reads.md). Không đề xuất endpoint mới.

## Kiểm thử bổ sung

`frontend/src/utils/groupHandoverFlow.test.mjs` chạy hai component thật `StaffGroupHandover` và `LegalHandoverReopen`, cùng các adapter thật, với một HTTP giả lập dùng dữ liệu tổng hợp riêng cho từng test. Không gọi API mạng thật, không dùng tài khoản hoặc checkpoint demo.

| Trường hợp | Phạm vi kiểm tra FE | E2E thật |
|---|---|---|
| Thiếu một người | Gửi đúng danh sách có mặt/revision; phản hồi tạm khóa giữ ẩn vùng bàn giao | Chưa chạy |
| Đã đủ người sau khi tạm khóa | Giữ lựa chọn đã lưu; chưa cho bàn giao trước quyết định | Chưa chạy |
| Staff yêu cầu mở lại | Đúng endpoint/khóa chống trùng; Legal đọc được yêu cầu, người ghi nhận, lý do và lịch sử | Chưa chạy |
| Legal duyệt | Bắt nhập lý do; receipt rồi đọc lại; Staff chỉ hiện vùng bàn giao khi GET cho phép | Chưa chạy |
| Legal từ chối | Lý do xuất hiện trong quyết định; Staff vẫn bị khóa | Chưa chạy |
| Yêu cầu mới sau từ chối | Staff gửi yêu cầu mới; quyết định tiếp theo trỏ đúng request mới, không dùng lại request đã từ chối | Chưa chạy |
| Thông báo có/không có xác nhận | Hiện phản hồi tương ứng receipt, không suy diễn `null` thành thành công thông báo | Chưa chạy |
| Duyệt mở lại nhưng còn điều kiện khác | `deliveryAllowed: false` vẫn ẩn vùng bàn giao | Chưa chạy |
| API chưa sẵn sàng | Cả hai màn hình hiện lỗi, không dùng dữ liệu demo thay dữ liệu thật, không phát lệnh ghi | Chưa chạy |

Luồng duyệt và từ chối được kiểm tra bằng tiếng Việt và tiếng Anh. Vùng bàn giao trong test là phần tử đánh dấu để xác nhận quyền hiển thị của component Staff; test không thực hiện bàn giao tài sản, tạo biên nhận hoặc đóng hồ sơ.

Chạy cùng nhóm kiểm thử hiện có:

```text
node --test src/utils/groupHandoverFlow.test.mjs src/utils/groupHandover.test.mjs src/utils/legalHandoverReopen.test.mjs src/utils/legalHandoverReopenWiring.test.mjs
```

Kết quả tại nhánh `test/PS-126-fe-integration`: **34/34 PASS**, gồm 7 test tích hợp mới và 27 test Staff/Legal hiện có; 0 skip/cancel. ESLint cho file test mới và `git diff --check` đạt. Không chạy lại toàn bộ FE/build trên nhánh chỉ bổ sung test và tài liệu này.

## Khi môi trường BE sẵn sàng

1. Dùng hồ sơ kiểm thử mới có nhiều người nhận, phân bổ/phê duyệt hợp lệ và phiên bàn giao mở; không dùng hoặc đặt lại checkpoint demo hiện hữu.
2. Staff ghi nhận thiếu người; đối chiếu UI và GET, kiểm tra mọi đường bàn giao bị chặn, SQL không có giao tài sản/biên nhận mới.
3. Staff ghi nhận đủ người; xác nhận vẫn tạm khóa, gửi yêu cầu có lý do. Kiểm tra thông báo Legal dẫn đúng hồ sơ.
4. Legal mở yêu cầu, đối chiếu danh tính, lý do, lịch sử và revision. Thử từ chối, xác nhận Staff nhận đúng lý do và vẫn không bàn giao được.
5. Staff gửi yêu cầu hợp lệ mới; Legal duyệt. Đối chiếu thông báo Staff, GET cho phép và ghi nhận bàn giao thực bằng UI; SQL phải khớp đúng tài sản/người nhận, không tự giao chỉ vì duyệt mở lại.
6. Kiểm tra yêu cầu cũ/đổi phiên/đổi người có mặt, gửi lại cùng khóa và tài khoản sai quyền. Lưu bằng chứng UI/API/SQL với commit thực tế, che token/thông tin bí mật, rồi mới lập bảng nghiệm thu PASS/FAIL.

Môi trường local gần nhất dừng lúc khởi động vì Flyway V54: checksum đã áp dụng `-1721281592`, source `-2081192083`. Không repair/reset database hoặc tắt kiểm tra migration trong phạm vi FE này.
