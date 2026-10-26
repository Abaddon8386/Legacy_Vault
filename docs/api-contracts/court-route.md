> **PS-102, 20/10/2026:** [COURT-only](court-only.md) supersedes conflicting NOTARIAL/write and will-MATCH requirements below. Legacy NOTARIAL is read-only.

# COURT — PS-47 (LV-COURT-001)

Chỉ `LEGAL_VERIFIER` thẩm định tính hợp lệ của quyết định tòa. Backend kiểm tra tính đầy đủ của
metadata và liên kết phiên bản; không tự kết luận hiệu lực pháp lý từ số văn bản, hash hay ngày ban hành.

`POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/court-decisions`
nhận `{ "version": 1, "result": "VALID", "reason": "Kết luận thẩm định của Legal" }`.
`result` gồm `VALID`, `INVALID`, `INCONCLUSIVE`; lý do bắt buộc, tối đa 1000 ký tự. Thành công trả `201`
và `Location` của collection. `GET` cùng URL trả lịch sử mới nhất trước; cả hai endpoint chỉ dành cho Legal.

Điều kiện ghi: ca `OPEN`, Vault `LEGAL_BASIS_VERIFICATION`, dossier `COURT` đã chuyển Legal,
phiên bản là bản mới nhất và đã `FORWARDED`. Loại văn bản phải là `COURT_JUDGMENT`/`COURT_DECISION`,
có bản số hóa, cơ quan ban hành, số văn bản và ngày không ở tương lai. Metadata tòa nằm trong phiên bản
bất biến của PS-41/42; kết luận PS-47 tham chiếu chính phiên bản đó.

Response: `id`, `caseId`, `version`, `sha256`, `result`, `reason`, `reviewedBy` (UUID Legal),
`reviewedAt` (UTC). Server lấy hash/actor/thời gian. Không trả khóa nội bộ hoặc nội dung file.
Thẩm định lại tạo bản ghi mới. Bản ghi có ID mới nhất của phiên bản hiện hành quyết định cổng COURT.

Lỗi: 400 request sai; 401 chưa đăng nhập; 403 sai role; 404 không có ca/phiên bản; 409
`BASIS_DOSSIER_INVALID_STATE`, `BASIS_VERSION_STALE` hoặc `COURT_EVIDENCE_REQUIRED`.
`COURT_DECISION_REQUIRED` là lỗi của guard khi chưa có kết luận `VALID` mới nhất cho phiên bản hiện hành.

Khóa Vault → ca → dossier, refresh trạng thái trước kiểm tra. Lưu kết luận và audit
`COURT_DECISION_RECORDED` với step `ST-20` và rule `LV-COURT-001` trong cùng transaction; audit không chứa lý do, số văn bản hay cơ quan ban hành.
V16 bổ sung bảng append-only, khóa ngoại và CHECK cho kết luận.

`CourtRouteGuard` là một điều kiện pháp lý cho các bước bảo vệ về sau: caller phải giữ các khóa
trong transaction thực hiện bước đó. Qua guard không có nghĩa đã đủ mọi điều kiện phê duyệt,
unlock hoặc handover; Sprint 2 không thực hiện các bước này.

Kiểm chứng: `CourtDecisionSqlServerTest` dùng DB tạm, API service tiếp nhận/chuyển thật và Flyway
toàn nhánh; kiểm tra kết luận, phiên bản, lịch sử bất biến và rollback audit.

## Review trước merge (2026-10-17)

- Điều kiện `LEGAL_SQLSERVER_MASTER_URL` đặt trên chính lớp SQL Server test; thiếu biến thì skip, không mở kết nối DB.
- Quyết định thứ tự merge: PS-46 → PS-47 → PS-48 trước PS-37 v2. PS-47 giữ
  `V16__court_decision_assessments.sql`; PS-48 giữ V17. Nhánh PS-37 phải đổi V16 trước khi tích hợp;
  PS-77 xử lý sau và phải cấp lại số migration không trùng. Không đổi số migration đã vào `develop`.
- Chỉ đồng bộ từ `origin/develop`; giữ lịch sử merge `main` đã có, không viết lại lịch sử PR đang review.
- Khi `develop` có thêm enum audit/error, merge giữ đủ giá trị hai phía và chạy lại test.
