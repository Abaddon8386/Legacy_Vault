# PS-71 — Close Handover Session: chờ nền tảng tích hợp

> Superseded: POST .../handover-sessions/{sessionId}/close đã có service, controller,
> immutable V29 completion evidence, dual gate trong transaction và audit rollback.
> COMPLETED không còn đủ để cấp receipt: receipt yêu cầu proof khớp version/hash/scope.
> SQL integration vẫn bị chặn bởi V25; V25 được giữ nguyên theo yêu cầu người dùng.

Trạng thái **QUEUED / DRAFT**, chưa có endpoint hoặc state transition được triển khai.
Nhánh riêng từ develop `d612b5d`, không chứa code của PS-57–66 hoặc PS-67–70.
Nguồn: [PS-71](https://thaithai9785.atlassian.net/browse/PS-71), LV-CLOSE-001:
chỉ close sau dual completion gate; sau close không mutation trái rule; audit/tests.

## Dependency

- PS-60 (Long): model/table/session ID, Staff/case/vault, lifecycle và lock chung.
- PS-57/58/59: approval còn hiệu lực và state Vault hợp lệ.
- PS-61: signed receipt; cần chốt receipt được tạo trước/sau close và điều kiện
  bắt buộc của ST-28, không suy ra thứ tự chỉ từ tên ticket.
- PS-64/65/66 và PS-67–70: snapshot approved scope, delivered, confirmed, AND gate.

Develop chưa có HandoverSession. Chưa chọn CLOSED hay COMPLETED thay tác giả PS-60:
AC PS-71 yêu cầu transition theo model, không cho biết chính xác tên trạng thái.

## Thiết kế use case để nối sau khi contract có sẵn

1. Resolve Staff từ principal, role phía server. Chỉ thao tác session đúng quyền;
   UUID ngoài quyền trả lỗi theo quy ước không lộ tài nguyên.
2. Trong một transaction, khóa theo thứ tự đã thống nhất với PS-60/65/70/72;
   hướng đề xuất Vault → Case → Session. Refresh state sau khóa, không tin cache cũ.
3. Kiểm tra session/case/vault, approval version/hash/scope hiện hành và receipt
   theo contract cuối cùng. Không tin ready/state/count/actor do FE gửi.
4. Tính lại cả hai gate trong transaction này. Bất kỳ vế pending hoặc dữ liệu
   không đủ đều không được chuyển terminal state.
5. Chuyển session sang terminal state theo PS-60, lưu actor/time và audit cùng
   transaction. Không đổi Vault ARCHIVED/case CLOSED ở đây nếu chưa chốt với PS-72.
6. Idempotency của close lặp và phản hồi khi session đã terminal phải chốt chung;
   không viết lại closedAt hoặc thêm audit trùng do retry nếu hợp đồng không yêu cầu.
7. Các mutation dùng chung session phải lấy cùng lock và kiểm tra terminal state
   sau khi lấy khóa, tránh request cũ tiếp tục ghi sau close.

Đề xuất route sau này: `POST /api/v1/handover-sessions/{sessionId}/close`.
Đây không phải public contract đã có hiệu lực; chưa đưa vào OpenAPI hiện hành.

## Acceptance scenarios khi dependency đủ

- Assets complete/Beneficiaries pending và trường hợp ngược lại đều không close.
- Cả hai đủ, scope/approval hợp lệ và đúng Staff: đúng một lần chuyển terminal state.
- Sai role/Staff/Vault/session hoặc approval invalid: không mutation/audit success.
- Hai close đồng thời: kết quả theo idempotency đã chốt, không duplicate audit.
- Delivery/confirmation cạnh tranh close: kiểm tra lại dưới khóa, không dựa kết quả
  GET tiến độ cũ; SQL Server thật, dùng DB tạm riêng.
- Approval invalidation hoặc hold cạnh tranh close: không close với approval cũ.
- Audit lỗi rollback close; lỗi lưu DB không để lại terminal state một phần.
- Mọi mutation session/recipient/delivery sau close bị guard theo contract; lịch sử
  vẫn đọc được theo quyền đã chốt.
- DTO/@Valid, ErrorCode, vi/en và OpenAPI đồng bộ khi có endpoint.

Phần độc lập hiện chỉ là đặc tả tích hợp và ca kiểm thử; chưa có runtime test.
Không tạo session giả, endpoint tạm hoặc thêm lifecycle cạnh tranh với PS-60.
Giữ Jira To Do; hỏi người dùng trước khi triển khai tiếp sau khi dependency hoàn thành.
