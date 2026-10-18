# PS-68 — Asset Completion Gate: phần chuẩn bị

> Superseded: API/service đã nối vào snapshot có khóa trên develop e9ea7f0.
> GET .../handover-sessions/{sessionId}/asset-completion trả completed/total/pending/complete.
> Asset nhiều người nhận chỉ complete khi mọi allocation APPROVED đã delivered.
> Scope rỗng không được xem complete. Không lọc người chưa verified khỏi mẫu số.

Trạng thái **QUEUED / chưa tích hợp**, nhánh riêng từ develop `d612b5d`.
Nguồn: [PS-68](https://thaithai9785.atlassian.net/browse/PS-68), LV-CLOSE-001:
100% Asset trong approved scope phải Delivered; còn pending thì chặn complete.

## Có thể kiểm thử độc lập

`handover.policy.AssetCompletionProgress` tính số Asset delivered/total/pending
từ hai tập UUID trong cùng scope. Đếm UUID phân biệt; delivery ngoài scope không
tăng tiến độ. Không nhận phần trăm làm đầu vào và không làm tròn 99% thành 100%.
Thiếu dữ liệu/null bị từ chối; tập rỗng không chứng minh hoàn tất.

Đây là hàm tính thuần, không được dùng kết quả do FE gửi làm bằng chứng để close.
Không thêm endpoint, query giả, migration hoặc dữ liệu demo để lấp dependency.

## Phần còn chờ

- PS-57/58: định danh approval/version/hash/scope và trạng thái hiệu lực.
- PS-60: session gắn approval và cơ chế khóa chung.
- PS-64/65/66: tập Asset được duyệt và tập **fully delivered** từ DB.
  Một Asset có nhiều người nhận không được coi delivered chỉ vì một allocation đã giao.
  Cần chốt cách roll-up allocation → Asset với contract của Dương.
- Đọc hai tập trong cùng snapshot/transaction; không dùng toàn bộ Asset của Vault
  làm mẫu số; không lấy scope của phiên bản dossier khác.
- Chốt nghiệp vụ scope rỗng trước khi tích hợp; hiện helper từ chối suy ra complete
  từ 0/0. Quy tắc này không tự cho phép/chặn một public workflow chưa tồn tại.
- API DTO/ErrorCode/OpenAPI theo contract chung, authorization, audit và SQL tests
  cạnh tranh delivery/close, approval invalidation, audit rollback khi được tích hợp.

Unit tests: partial/out-of-scope, duplicate rows, đủ scope, scope rỗng,
delivery rỗng, null và số đếm không hợp lệ. Chưa chứng minh transaction/SQL behavior.
Chỉ tiếp tục phần tích hợp sau khi dependency sẵn sàng và người dùng đồng ý.
