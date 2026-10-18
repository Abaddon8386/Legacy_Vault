# PS-69 — Beneficiary Completion Gate: phần chuẩn bị

> Superseded: GET .../handover-sessions/{sessionId}/beneficiary-completion đã có service/JPA.
> Đếm confirmation cùng session/version/scope hash; toàn approved recipient set là mẫu số.
> Người chưa verified vẫn ở mẫu số, không được tính complete. Delivery không tự confirm.

Trạng thái **QUEUED / chưa tích hợp**, nhánh riêng từ develop `d612b5d`.
Nguồn: [PS-69](https://thaithai9785.atlassian.net/browse/PS-69), LV-CLOSE-001:
100% Beneficiary liên quan phải Confirmed, pending thì gate fail.

`handover.policy.BeneficiaryCompletionProgress` tính confirmed/total/pending từ
tập UUID Beneficiary trong approved scope và tập UUID có confirmation riêng.
Một Beneficiary có nhiều allocation chỉ tính một lần. Confirmation ngoài scope
không tăng tiến độ. Delivery không phải nguồn dữ liệu cho tập confirmed.

Unit tests: người nhận còn pending không được thay bằng confirmation ngoài scope;
duplicate không tăng số lượng; tất cả confirmed; tập rỗng; null/count sai.
Scope rỗng chưa được quy định trong Jira: helper không suy ra complete từ 0/0,
cần chốt nghiệp vụ trước khi nối vào workflow thực tế.

## Chờ tích hợp

- PS-57/58/60/64: approval, scope và session chung; không dùng toàn bộ Beneficiary
  của Vault hoặc scope dossier mới thay cho scope đã duyệt của session.
- PS-62/63: recipient mapping; không gộp nhiều Beneficiary theo cùng linked user.
- PS-67: confirmation có actor/time/reference và idempotency/persistence đã kiểm chứng.
- Đồng bộ snapshot và thứ tự khóa với completion/close; refresh sau khóa.
- Authorization/error/API/OpenAPI, query SQL và tests integration: confirmation
  cùng lúc close, invalidation, confirmation phiên khác không được tính vào session này.

Chưa có API/schema hoặc service tích hợp. Không chuyển Jira Done, không gọi helper
với count/scope do client cung cấp để cấp quyền close. Chỉ tiếp tục khi dependency
sẵn sàng và người dùng đồng ý.
