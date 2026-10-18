# PS-72 — Archive Vault và Close Case: chờ tích hợp

Trạng thái **QUEUED / DRAFT**, nhánh riêng từ develop `d612b5d`.
Nguồn: [PS-72](https://thaithai9785.atlassian.net/browse/PS-72), LV-CLOSE-001:
sau hoàn tất Vault ARCHIVED, case CLOSED; atomic, read-only, giữ audit/legal history.

## Đối chiếu baseline

- `Vault` chưa có trạng thái hoặc transition ARCHIVED và chưa có UNLOCKED/handover state.
- `VerificationCase` chỉ có OPEN/CANCELLED. `cancel()` không thể dùng thay close:
  trạng thái và ý nghĩa nghiệp vụ khác nhau.
- `StaffVerificationCaseService.listCases` chỉ chấp nhận filter OPEN/CANCELLED:
  khi thêm CLOSED phải cập nhật service/contract/error/test đồng bộ.
- `StaffVaultCaseGuard` đã yêu cầu ca OPEN khi mutation; vẫn cần rà tất cả đường ghi
  dưới các state mới, không chỉ bổ sung guard ở endpoint archive.
- Rule một Vault/Owner trọn đời V19 phải giữ sau ARCHIVED; không physical delete,
  không đổi Owner để tạo lại quyền tạo kho.

## Phần tích hợp cần làm sau dependency

1. PS-57–66 cung cấp approval/session/delivery/recipient model, PS-67–70 cung cấp
   gate đúng scope và PS-71 cung cấp điều kiện terminal session. Chốt receipt PS-61
   và ranh giới transaction giữa PS-71/72 trước khi tạo endpoint.
2. Resolve actor từ principal và kiểm tra quyền truy cập, không nhận actor/state
   hay cờ completed từ FE. Trước khi transition phải đọc lại state đã khóa.
3. Khóa cùng thứ tự với session close và các mutation; đề xuất Vault → Case → Session,
   cần đồng thuận với PS-60/65/71. Tránh Owner→Vault / Vault→Owner tạo lock cycle.
4. Trong transaction archive, xác minh session kết thúc hợp lệ, approval/scope và
   completion theo chính sách đã chốt. Không dùng progress đọc ngoài transaction.
5. Chuyển Vault ARCHIVED và case CLOSED, ghi closedAt/updatedAt và audit trong cùng
   transaction; audit hoặc persistence lỗi phải rollback toàn bộ.
6. Thêm transition/state vào entity, query/filter, DTO, OpenAPI và vi/en/error contract
   đồng bộ. Chỉ thêm migration mới nếu model/constraint thực tế cần; chọn số migration
   sau khi fetch và kiểm tra các nhánh tích hợp, không giữ chỗ số Flyway lúc này.
7. Rà toàn bộ mutation: Owner Asset/Will/DMS/config; Staff intake/contact/identity;
   Legal classify/review/hold/court; handover/linking/delivery/confirmation.
   Mỗi đường phải kiểm tra đúng lifecycle trong transaction, kể cả request bắt đầu trước archive.
8. Giữ quyền đọc lịch sử theo contract, bảo toàn files/versions, legal approvals,
   recipient confirmations, audit và receipt. Không xóa dữ liệu để đạt read-only.
9. Chốt retry/idempotency cho archive lặp; không tự mở lại CLOSED hoặc đổi ARCHIVED
   về ACTIVE qua đường check-in/cancel alert/review hold.

Chưa đề xuất route cuối cùng: cần biết close/archive là một use case chung hay hai
thao tác riêng theo contract PS-60/61/71, tránh mở API bypass completion.

## Acceptance scenarios sau khi có model

- Gate còn pending hoặc session chưa terminal: không archive/close case.
- Đủ điều kiện: Vault ARCHIVED và case CLOSED cùng commit, đúng actor/time/audit.
- Audit thất bại hoặc lỗi lưu một trong hai entity: cả hai trở về state trước.
- Hai archive đồng thời: đúng semantics retry, không duplicate audit/closedAt.
- Delivery/confirmation/hold/invalidation/cancel alert đua archive: khóa chung,
  refresh sau khóa, không có dữ liệu mới ghi trái rule sau terminal state.
- Gọi từng đường mutation sau archive: bị chặn; historical read đúng quyền vẫn chạy.
- Query/filter CLOSED trả đúng dữ liệu; UUID khác quyền không lộ sự tồn tại.
- Tạo Vault mới sau archive vẫn 409 VAULT_ALREADY_EXISTS; history/files không bị mất.
- SQL Server thật trên DB tạm: migration fresh và upgrade theo baseline cuối;
  không reset DB local/shared, không sửa checksum hoặc Flyway history.

Hiện chỉ chuẩn bị đặc tả và ca kiểm thử, chưa có runtime test/endpoint/migration.
Giữ Jira To Do, chờ dependency và hỏi người dùng trước khi tiếp tục.
