# Hold và xét lại — PS-48 (LV-HOLD-001)

Quyết định nghiệp vụ: Legal được đưa hồ sơ có tranh chấp mới/thiếu chứng cứ về hold; toàn bộ lịch sử
và các phiên bản cũ giữ nguyên. Sau hold phải tiếp nhận và chuyển một phiên bản mới để xét lại.

`POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/hold`, chỉ `LEGAL_VERIFIER`:

```json
{"cause":"NEW_DISPUTE","reason":"Lý do và chứng cứ do Legal ghi nhận"}
```

`cause`: `NEW_DISPUTE` hoặc `INSUFFICIENT_EVIDENCE`; `reason` bắt buộc, tối đa 1000 ký tự.
Ca phải `OPEN`, hồ sơ `NOTARIAL`/`COURT`, Vault `AWAITING_LEGAL_BASIS` hoặc `LEGAL_BASIS_VERIFICATION`.
`200 BasisDossierResponse`, bổ sung `requiredVersion` (số phiên bản tối thiểu phải nộp sau hold).
`requiredVersion = max(phiên bản đang có) + 1`; chưa có văn bản thì bằng 1.

Trong cùng transaction: chụp phân loại cũ vào lịch sử; đổi route và Vault thành `ON_HOLD`, hồ sơ về
`DRAFT`; ghi nguyên nhân, Legal actor, thời gian và audit `LEGAL_BASIS_HELD`. Không sửa/xóa phiên bản,
phân bổ hoặc kết luận COURT cũ. Audit không chứa `reason` hay metadata giấy tờ.

Resume dùng API `/basis-dossier/reclassification` hiện có: Legal chọn `NOTARIAL`/`COURT` và ghi lý do
sau khi xem chứng cứ. Trạng thái về `AWAITING_LEGAL_BASIS`, `requiredVersion` giữ nguyên. Staff phải
nộp phiên bản mới rồi chuyển Legal bằng API PS-42. Phiên bản cũ và kết luận VALID cũ không được dùng
lại để cho qua guard. COURT cần kết luận mới của Legal cho đúng phiên bản mới đã chuyển.

Lỗi: 400 request sai; 401 chưa đăng nhập; 403 sai role; 404 thiếu ca/hồ sơ; 409
`BASIS_DOSSIER_INVALID_STATE` khi ca đã hủy, đã hold hoặc Vault sai trạng thái. Guard bảo vệ trả
`LEGAL_WORKFLOW_ON_HOLD` khi Vault hoặc route đang hold. API tiếp nhận/chuyển vẫn áp dụng các lỗi
trạng thái cũ; `BASIS_VERSION_STALE` chặn chuyển phiên bản thấp hơn `requiredVersion`.

`LegalWorkflowGuard.requireProtectedTransition(caseId, APPROVAL|UNLOCK|HANDOVER)` là guard pháp lý
dùng trong transaction của use-case bảo vệ. Nó khóa và refresh Vault → ca → dossier, chặn hold,
chặn thiếu phiên bản mới đã chuyển và gọi cổng quyết định COURT. Guard dùng `MANDATORY`: caller phải
có transaction và giữ khóa cho tới khi hoàn tất thao tác. Caller vẫn phải kiểm tra quyền, giai đoạn
và các điều kiện nghiệp vụ khác; guard này không phê duyệt hoặc cấp quyền unlock/handover.
Sprint 2 không thêm endpoint unlock/handover hoặc chuyển Vault sang trạng thái mở khóa.

Tiếp nhận, chuyển hồ sơ, kết luận tòa và hold đều theo thứ tự Vault → ca → dossier và refresh dữ liệu
sau khóa. V17 thêm `required_version_no`, không sửa migration đã áp dụng. PS-77 không được tích hợp.

`LegalHoldSqlServerTest` kiểm tra luồng hold → resume → nộp/chuyển phiên bản mới → kết luận lại,
giữ lịch sử/hash, ca cache cũ, rollback audit và cả hai thứ tự commit khi hold cạnh tranh với
tiếp nhận, forward hoặc đánh giá COURT. Các DB thử nghiệm có tên ngẫu nhiên và được xóa sau khi đóng context.
