> **28/10/2026 — updated workflow:** [Staff–Legal workflow](staff-legal-workflow.md) supersedes earlier COURT-only, read-only NOTARIAL and optional-will restrictions below. Valid notarized documents are supported; death verification, matching will comparison, basis assessment, reasoned final decision and separate unlocking are required. Existing scope/snapshot checks remain.

> **Stale-review fix:** POST `/basis-dossier/review` now requires `reason`, `versionNo`, `sha256Hash`, `allocationHash`, `disputeStatus` from the context snapshot displayed to Legal. Missing snapshot returns 400; any mismatch returns 409 LEGAL_DECISION_STALE before writes/audit, under Vault -> Case -> Dossier locks. Reason-only legacy clients must upgrade; no fallback to reviewing the newest version. Request-supplementation still takes only reason. FE captures the snapshot on load and sends it unchanged on review; it must not fetch a new hash at click time and silently attest that version.

> **PS-102, 20/10/2026:** [COURT-only](court-only.md) supersedes conflicting NOTARIAL/write and will-MATCH requirements below. Legacy NOTARIAL is read-only.

# PS-102 — Legal queue và read context

Contract bổ sung cho PS-99/100/101, 20/10/2026. Chỉ BE; FE nối adapter theo contract này ở phần việc tích hợp của FE. Không biến callback/mock thành HTTP contract và không dùng API Staff/Owner.

## Phạm vi quyền

Hai GET bên dưới yêu cầu JWT + `LEGAL_VERIFIER`, không chấp nhận chỉ ADMIN/STAFF/OWNER. Chính sách **đã có**: `LegalCaseLookupRepository` và `BasisDossierViewService.forLegal` cho Legal đọc các verification case không lọc theo assigned Staff; Legal không có assignment riêng. Queue áp dụng chính sách này cho các case có Vault tồn tại, không khám phá mọi Vault/Owner ngoài verification case. Không tạo hay thay assignment. Case không tồn tại/trỏ Vault không tồn tại → 404, thiếu role → 403, thiếu JWT → 401. Không thêm quyền tải file/reveal/CCCD/nội dung Asset; chỉ metadata và reference đã được các read Legal hiện hữu cho phép.

## GET /api/v1/legal-verifications/verification-cases

Query `page` mặc định 0 (>=0), `size` mặc định 20 (1–100), `status` tùy chọn OPEN/CLOSED/CANCELLED, `route` tùy chọn NOTARIAL/COURT/ON_HOLD. Không filter nghĩa tất cả case trong phạm vi Legal; route chỉ khớp dossier đã phân loại. Query không hợp lệ → 400 VALIDATION_FAILED theo shared VI/EN. Sort cố định openedAt DESC, internal case key DESC để tie-break ổn định; không cho SQL/sort tùy ý từ client.

Envelope `{content,page,size,totalElements,totalPages}`. Mỗi item: `{caseId,caseNumber,vaultId,caseStatus,vaultStatus,route,dossierStatus,reviewStatus,openedAt}`. UUID là khóa API; caseNumber là mã hiển thị hiện hữu, không nhập ID nội bộ làm API key. Các field dossier nullable cho ca legacy/chưa phân loại. Không có owner email, password, nội dung file hoặc plaintext secrets. Queue thay đổi theo workflow; các trang/count không phải snapshot xuyên nhiều request.

## GET /api/v1/legal-verifications/verification-cases/{caseId}/context

Trả `{caseId,caseNumber,vaultId,caseStatus,vaultStatus,deathDocuments,willComparison,basisDossier,snapshot,capabilities,evaluatedAt}`.

- `deathDocuments`: `[{id,documentType,receivedAt}]`, metadata để chọn giấy tờ; chi tiết dùng GET Legal hiện hữu.
- `willComparison`: tái sử dụng `WillComparisonOverviewResponse` (original intakes, will/version/hash, comparison history), không bytes/file content.
- `basisDossier`: tái sử dụng `BasisDossierResponse` hoặc null nếu chưa phân loại.
- `snapshot`: null khi chưa có dossier; nếu có gồm dossierId, currentVersion (0 nếu chưa có văn bản), requiredVersion, sha256Hash, allocationHash, disputeStatus, reviewStatus, reviewFresh, approvalCurrent, latestDecision và courtResult. Hash/scope dùng hàm và guard hiện hữu, không tự chọn căn cứ theo loại file/ngày upload. `latestDecision` nếu có chỉ là evidence gần nhất (id/version/hash/allocationHash/disputeStatus/result/reviewedBy/reviewedAt), có thể cũ; chỉ approvalCurrent mới cho biết còn khớp snapshot hiện hành.
- `capabilities`: `{approval:{allowed,blockedReason},unlock:{allowed,blockedReason}}`. blockedReason là error-code hiện hữu hoặc null. Read là dữ liệu tư vấn tại evaluatedAt, không phải chứng từ cấp quyền và không thay final guard. Approval và controlled unlock là hai mutation riêng, giữ nguyên API/transaction/guard.

Đọc context giữ khóa Vault → Case → Dossier như mutations và refresh managed state để metadata/snapshot/capability nhất quán, kể cả cạnh tranh với hold/re-review/version mới. Không tạo dossier, không ghi audit/approval, không mở Vault hoặc giải mã trong GET. Khi chưa có dossier/hết hiệu lực/ON_HOLD/case đóng, vẫn trả metadata trong phạm vi quyền nhưng khóa action tương ứng. Chưa có approval, rejected, stale version/hash/allocation/dispute, COURT chưa VALID hoặc required version chưa đáp ứng đều không cho unlock. Sau GET, FE phải đọc lại trước quyết định và xử lý 409 nếu có thay đổi; server luôn kiểm tra lại ở mutation.

## Ranh giới bàn giao trực tiếp

Legal có thể duyệt trước, không cần cùng có mặt tại quầy. Không có flag Legal online/ở quầy. Staff và người nhận bàn giao vẫn phải gặp trực tiếp, đối chiếu/ghi chứng từ theo guard/quy trình hiện hữu; mã mời/email không tạo chứng từ bàn giao. PS-102 không sửa mutation/receipt thứ tự hoặc quyền đọc item DELIVERED của Beneficiary. Thay đổi căn cứ/phạm vi trước giao cần Legal review lại; read snapshot không ghi đè lịch sử hay thu hồi item đã giao.

Không migration/seed/reset/checksum repair trong PS-102. Case legacy thiếu dossier hoặc văn bản không được suy ra đã phê duyệt. Browser FE/BE E2E chỉ được báo đạt khi adapter FE đã nối và có bằng chứng riêng; SQL/MVC tests không thay bằng chứng gặp mặt tại quầy.
