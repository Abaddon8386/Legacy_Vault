# PS-67–72 — Integration evidence, 18/10/2026

> SQL follow-up 19/10: V25 fixed on develop; local integrated SQL/regression now passes.
> See [PS-67-72-sql-integration-2026-10-19.md](PS-67-72-sql-integration-2026-10-19.md).
> The blocker and results below are the historical 18/10 snapshot.

> Review follow-up: V30 đã bỏ 26 INSERT trigger events, giữ UPDATE/DELETE và bổ sung
> service locking/refresh. Xem [PS-72-V30-insert-output-review.md](PS-72-V30-insert-output-review.md)
> để lấy kết quả kiểm thử mới. Các số liệu bên dưới là snapshot lượt tích hợp trước.

## Phạm vi

Theo yêu cầu người dùng: kiểm tra các nhánh PS-56–66, dùng dependency đã có để triển khai
phần còn lại, cập nhật đúng nhánh/PR đang có; không tạo nhánh remote/PR mới và không merge.
Fetch origin xác minh develop tại e9ea7f0 đã tích hợp PS-57–66, gồm PR #127 delivery
và các dependency approval/unlock/session/recipient/receipt. FE PS-56 cũng đã tích hợp.

Các nhánh hiện có được rebase thành chuỗi PS-67 → 68 → 69 → 70 → 71 → 72 để dùng
chung code chưa merge. Mọi PR vẫn target develop; PR phía sau chứa dependency của
PR phía trước cho tới khi chúng được tích hợp bởi người có thẩm quyền.

- PS-67: feature/PS-67-beneficiary-reconciliation, PR #112.
- PS-68: feature/PS-68-asset-completion-gate, PR #110.
- PS-69: feature/PS-69-beneficiary-completion-gate, PR #109.
- PS-70: feature/PS-70-dual-completion-gate, PR #113.
- PS-71: feature/PS-71-close-handover-session, PR #114.
- PS-72: feature/PS-72-archive-vault-close-case, PR #115.

## Triển khai

- PS-67: JPA confirmation bất biến, API đọc/ghi Staff theo session/approved snapshot,
  actor/time server, reference riêng, idempotent retry, không auto-confirm khi delivery.
- PS-68: distinct Asset; mọi approved allocation của Asset phải delivered, không
  bỏ recipient chưa verified khỏi mẫu số.
- PS-69: distinct approved Beneficiary; confirmation đúng session/version/scope,
  identity còn verified; delivery không thay confirmation.
- PS-70: cùng snapshot khóa Vault → case → dossier → session; dual gate đọc từ DB,
  không dựa flags/count client; pending hoặc scope rỗng chặn close.
- PS-71: close kiểm tra lại gate, OPEN → COMPLETED, proof V29 bất biến, audit cùng
  transaction; retry giữ timestamp/audit. Receipt Staff cần proof khớp current scope.
- PS-72: archive cần proof/dual gate/receipt coverage, case CLOSED + Vault ARCHIVED
  cùng transaction; case lưu đúng session đã đóng. V30 read-only guards theo numeric
  SQL error 51300, giữ audit/history và lifetime Vault ownership.
- OpenAPI, typed errors, vi/en và API security tests đã cập nhật. Không sửa FE.

Contract chi tiết: docs/api-contracts/handover-completion.md.

## Kiểm thử đã chạy

Tại backend, trên cây code tích hợp PS-72:

`mvnw.cmd -Dtest=*,!LegacyvaultBackendApplicationTests clean test`

Kết quả: **580 tests, 474 pass, 106 skipped, 0 failure/error**.
Loại riêng application contextLoads vì cần DB. 106 SQL/environment opt-in tests không
được bật trong lượt này. Đây là regression unit/API, **không phải full SQL/E2E**.
Bao gồm primitive policies, controller authentication/role/validation/error,
shared-Asset calculation, AND rule, close proof/retry, receipt proof và archive gate/retry.

git diff --check đạt; V25 giữ nguyên blob so với develop.
Log ignored: backend/ps67-72-unit-regression.log; focused logs ps67-web.log,
ps68-tests.log, ps69-tests.log, ps70-tests.log, ps71-tests.log, ps72-tests.log.

## Blocker SQL — chưa được đánh dấu hoàn tất AC

Đã thử bật BeneficiaryReconciliationSqlServerTest với LEGAL_SQLSERVER_MASTER_URL
trỏ master và Windows integrated auth; fixture tự tạo/drop DB ngẫu nhiên riêng.
Flyway thất bại tại **V25__create_handover_receipts.sql**, trước V28–30:

- SQL Server error **111**: CREATE TRIGGER phải là câu đầu tiên của batch.
- Thiếu GO giữa index/table DDL và CREATE TRIGGER đầu tiên của V25.
- Người dùng đã chọn **giữ V25 và chờ Long sửa PS-61**. Không sửa V25,
  repair/checksum/schema history hoặc reset DB local/shared.
- Log: backend/ps67-sql.log. Đây là lượt SQL thất bại, không cộng vào kết quả pass.

Đã bổ sung 18 SQL tests ở sáu concrete opt-in suites PS-67–72 cho scope/ownership,
retry, concurrency, audit rollback, receipt proof, archive atomicity/read-only/history.
Các tests này đã compile nhưng **chưa chạy qua SQL Server** vì blocker V25.
Migration V28/V29/V30, JPA query/runtime mapping, concurrency và rollback chưa
được chứng nhận. Không tuyên bố các ticket hoàn tất toàn bộ AC.

## Sau khi Long sửa dependency

1. Kiểm tra commit/PR và xử lý tương thích V25 theo lịch sử DB thật, không repair tự động.
2. Rebase/update đúng các nhánh hiện có; kiểm tra migration collision V28–30.
3. Chạy sáu SQL suites mới cùng baseline handover/session/receipt suites trên DB tạm.
4. Chạy context/full SQL regression thích hợp; sửa lỗi thực tế, xác minh fresh/upgrade.
5. Rà soát integration FE theo contract, phân biệt Staff attestation với chữ ký số.
6. Hỏi người dùng trước khi tiếp tục ở lần theo dõi sau; không merge hoặc đổi Jira Done.
