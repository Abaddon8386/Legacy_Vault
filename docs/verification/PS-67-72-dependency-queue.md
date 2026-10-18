# PS-67–72 — Hàng chờ dependency

> Cập nhật: dependency backend PS-57–66 đã có trên develop e9ea7f0.
> Phần triển khai tiếp theo và giới hạn kiểm chứng ở
> [PS-67-72-integration-2026-10-18.md](PS-67-72-integration-2026-10-18.md).
> Snapshot bên dưới là lịch sử trước lần tích hợp; không dùng để kết luận code hiện tại.

Ngày: 2026-10-18, Asia/Saigon. Theo yêu cầu người dùng: làm phần độc lập, chờ
PS-56–66 hoàn thành, hỏi lại trước khi triển khai phần còn lại. PS-80 tạm chờ.

## Baseline kiểm chứng

- Atlassian site: https://thaithai9785.atlassian.net, PS Sprint 3 ID 14 (future).
- Ân Ngô được giao PS-67–72 và PS-80, tất cả To Do ở lần kiểm tra này.
- PS-56 Done (FE, Lê Gia Huy); PS-57–61 To Do (Long); PS-62–66 To Do (Dương).
  Vẫn theo dõi PS-56 theo phạm vi người dùng yêu cầu.
- Fetch origin thành công; develop `d612b5d` đã chứa PS-77 PR #64 và PS-37 PR #98.
  Tệp handoff cũ không còn đại diện cho trạng thái merge hiện tại.
- Develop chưa có backend approval/unlock/handover session/delivery model.
  Preview PS-49–52 chỉ là FE, không thay backend dependency.

## Các nhánh độc lập, đều bắt đầu từ develop d612b5d

- `codex/PS-67-beneficiary-reconciliation`, commit `06bf158`:
  value model confirmation có actor/time/reference, 5 unit tests;
  `docs/api-contracts/beneficiary-reconciliation-proposal.md` trên nhánh này.
- `codex/PS-68-asset-completion-gate`, commit `c23680e`:
  tính tiến độ distinct Asset trong approved scope, 5 unit tests;
  `docs/api-contracts/asset-completion-gate-proposal.md` trên nhánh này.
- `codex/PS-69-beneficiary-completion-gate`, commit `2676a5e`:
  tính tiến độ distinct recipient với confirmation riêng, 5 unit tests;
  `docs/api-contracts/beneficiary-completion-gate-proposal.md` trên nhánh này.
- `codex/PS-70-dual-completion-gate`, commit `1ebd398`:
  AND gate số nguyên, 7 unit tests;
  `docs/api-contracts/dual-completion-gate-proposal.md` trên nhánh này.
- `codex/PS-71-close-handover-session`, commit `6fbb17a`:
  đặc tả close/transaction/authorization/idempotency/concurrency tests;
  `docs/api-contracts/close-handover-session-proposal.md` trên nhánh này.
- `codex/PS-72-archive-vault-close-case`:
  đặc tả archive/close, rà baseline entity/filter, acceptance scenarios và hàng chờ;
  `docs/api-contracts/archive-vault-close-case-proposal.md`.

Các file thuộc nhánh khác không xuất hiện ở checkout hiện tại: đọc bằng `git show
<branch>:<path>`, không merge các nhánh để xem. Không nhánh nào chứa commit của nhánh
chuẩn bị khác. Toàn bộ phần này chưa có endpoint/persistence/SQL integration mới.

## Validation đã chạy (các lượt độc lập)

Từ backend, trên đúng nhánh tương ứng:

- PS-67: `mvnw.cmd -Dtest=BeneficiaryConfirmationTest test`: 5 pass, 0 fail/error/skip.
- PS-68: `mvnw.cmd -Dtest=AssetCompletionProgressTest test`: 5 pass, 0 fail/error/skip.
- PS-69: `mvnw.cmd -Dtest=BeneficiaryCompletionProgressTest clean test`: 5 pass, 0 fail/error/skip.
- PS-70: `mvnw.cmd -Dtest=DualCompletionGateTest clean test`: 7 pass, 0 fail/error/skip.
- PS-71/72 chỉ tài liệu: kiểm tra whitespace; không tạo runtime tests cho đặc tả.

Tổng 22 test mới đạt trong bốn lượt riêng; **không phải full suite hay E2E**.
Các helper không tự cấp quyền close/archive. Chưa chứng minh atomicity trên SQL Server.
Không có test DB/reset/migration/secret hoặc thay đổi public API trong phần chuẩn bị.

## Điều kiện tiếp tục

1. Đọc lại Jira, fetch origin và xác minh PR/code/contract dependency trên develop.
   Jira Done riêng lẻ không chứng minh backend đã tích hợp.
2. Chốt session lifecycle, scope/recipient identity, roll-up delivery cho Asset có
   nhiều người nhận, receipt/reference, idempotency, scope rỗng và thứ tự khóa chung.
3. Báo cho người dùng dependency nào đã đủ và xin đồng ý tiếp tục phần tích hợp.
4. Rebase/update từng nhánh theo hướng được phép, không merge nhánh khác; kiểm tra
   AGENTS.md, migration mới và tương thích trước khi sửa.
5. Nối service/JPA/security/DTO/OpenAPI/error/audit và SQL concurrency tests; chỉ
   đánh giá hoàn thành ticket khi toàn bộ AC đã được kiểm chứng.
6. Theo yêu cầu người dùng: hỏi lại trước khi push từng nhánh và tạo PR riêng.
   Chưa được phép merge PR hoặc thay trạng thái Jira.

Theo dõi trong chat đã tạo: `theo-d-i-dependency-ps-67-72`, hằng ngày 09:00;
im lặng khi không có thay đổi actionable, hỏi trước khi tiếp tục.
PS-80 chờ chọn cổng thanh toán/sandbox, kỳ tháng, MB/GB và các policy còn mở;
không triển khai payment hoặc mở entitlement trong lúc chờ.
