> **Stale-review fix:** POST `/basis-dossier/review` now requires `reason`, `versionNo`, `sha256Hash`, `allocationHash`, `disputeStatus` from the context snapshot displayed to Legal. Missing snapshot returns 400; any mismatch returns 409 LEGAL_DECISION_STALE before writes/audit, under Vault -> Case -> Dossier locks. Reason-only legacy clients must upgrade; no fallback to reviewing the newest version. Request-supplementation still takes only reason. FE captures the snapshot on load and sends it unchanged on review; it must not fetch a new hash at click time and silently attest that version.

> **PS-102, 20/10/2026:** [COURT-only](court-only.md) supersedes conflicting NOTARIAL/write and will-MATCH requirements below. Legacy NOTARIAL is read-only.

# Hồ sơ căn cứ phân chia di sản — PS-41, PS-42, PS-43 (ST-16..19, LV-BASIS-001)

**Trạng thái:** PS-41 (phân loại của Legal, tiếp nhận văn bản của Staff) PS-42 (Staff chuyển văn bản cho Legal) và PS-43 (Legal phân loại lại từ ON_HOLD, kiểm tra thông tin công chứng) đã triển khai. Các quyết định thiết kế được ghi ở
[D-API-36](open-decisions.md); đó là cách đọc Main Flow v4.2 và `09_Decision_Legal_Basis_Branches.md`, chờ nhóm xác nhận.

PS-46–48 bổ sung kiểm chứng và luồng COURT/hold: xem [court-route.md](court-route.md) và
[legal-workflow-hold.md](legal-workflow-hold.md). Các giới hạn cũ bên dưới được thay thế ở phạm vi này.

## 1. Mô hình và luồng

Một ca xác minh có tối đa **một hồ sơ căn cứ** (`legal_basis_dossiers`), gồm nhiều **phiên bản văn bản** (`legal_basis_dossier_versions`).

| Bước | Ai | Việc | Kết quả |
|---|---|---|---|
| ST-16 | **Legal** | Phân loại nhánh `NOTARIAL`/`COURT`/`ON_HOLD`, ghi lý do và chứng cứ, tạo hồ sơ | Hồ sơ `DRAFT`; Vault `AWAITING_LEGAL_BASIS` (hoặc `ON_HOLD`) |
| ST-18 | **Staff** | Tiếp nhận văn bản **đã số hóa**: loại, cơ quan, số, ngày, hash, phiên bản | Hồ sơ `LEGAL_BASIS_PROVIDED` |
| ST-19 | Staff | Chuyển văn bản đúng phiên bản cho Legal (PS-42) | Hồ sơ `LEGAL_BASIS_FORWARDED` |

- **Staff không bao giờ chọn nhánh** (AC-L04). Hồ sơ do Legal tạo; Staff chỉ bổ sung phiên bản.
- **Tiếp nhận không đồng nghĩa đã duyệt.** Mọi thao tác ở đây không cấp quyền giải mã hay bàn giao.
- Tiến độ hồ sơ nằm ở `legal_basis_dossiers.status` (chính là `dossiers.status` của Main Flow), **không** ở `verification_cases.status`.

## 2. Endpoint của PS-41

Mọi ID là UUID công khai, thời gian ISO-8601 UTC có `Z`; không có khóa nội bộ.

| Method | Đường dẫn | Vai trò | Mô tả |
|---|---|---|---|
| `POST` | `/api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier` | `LEGAL_VERIFIER` | Phân loại và tạo hồ sơ (ST-16). `201` |
| `GET` | cùng đường dẫn | `LEGAL_VERIFIER` | Xem hồ sơ kèm lý do phân loại |
| `POST` | cùng đường dẫn + `/reclassification` | `LEGAL_VERIFIER` | Phân loại lại hồ sơ `ON_HOLD` sang `NOTARIAL`/`COURT` (PS-43). `200` |
| `POST` | `/api/v1/staff/verification-cases/{caseId}/basis-dossier/versions` | `STAFF_EXECUTOR` | Tiếp nhận văn bản số hóa (ST-18), `multipart/form-data`. `201` |
| `POST` | `/api/v1/staff/verification-cases/{caseId}/basis-dossier/versions/{version}/forward` | `STAFF_EXECUTOR` | Chuyển phiên bản mới nhất cho Legal (ST-19, PS-42). `200` |
| `GET` | `/api/v1/staff/verification-cases/{caseId}/basis-dossier` | `STAFF_EXECUTOR` | Xem hồ sơ (không có lý do phân loại) |

Staff chỉ thao tác trên ca **mình đã nhận**; ca khác hoặc ca chưa nhận trả `404`.

### 2.1 POST phân loại (Legal)

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `route` | enum | có | `NOTARIAL`, `COURT`, `ON_HOLD` (chưa đủ thông tin) |
| `routeReason` | string | có | lý do và chứng cứ, không rỗng, tối đa 1000 ký tự |

```json
{ "route": "NOTARIAL", "routeReason": "Không tranh chấp; các bên đã thỏa thuận, đủ điều kiện công chứng." }
```

- Điều kiện: ca `OPEN`, Vault `WILL_VERIFICATION` **và** kết quả đối chiếu di chúc mới nhất của ca là `MATCH` ([PS-40](legal-will-comparison.md)).
- Trạng thái tranh chấp suy từ nhánh: `NOTARIAL` → `NONE`, `COURT` → `DISPUTED`, `ON_HOLD` → `UNDETERMINED`.
- Vault: `NOTARIAL`/`COURT` → `AWAITING_LEGAL_BASIS`; `ON_HOLD` → `ON_HOLD` (đi qua `LEGAL_BASIS_CLASSIFICATION` trong cùng một thao tác).
- Mỗi ca chỉ một hồ sơ; tạo lần hai trả `409 BASIS_DOSSIER_ALREADY_EXISTS`. Phân loại lại từ `ON_HOLD` thuộc PS-43.

### 2.2 POST tiếp nhận (Staff), `multipart/form-data`

Hai phần: `metadata` (JSON, `Content-Type: application/json`) và `file` (PDF/JPEG/PNG, tối đa 10 MB, cùng giới hạn với di chúc).

| Trường `metadata` | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `legalBasisType` | enum | có | `NOTARIAL_PARTITION` (nhánh NOTARIAL) hoặc `COURT_JUDGMENT`/`COURT_DECISION` (nhánh COURT) |
| `issuingAuthority` | string | có | nơi ban hành/công chứng, tối đa 255 |
| `documentNumber` | string | có | số văn bản, tối đa 100 |
| `issueDate` | date | có | `yyyy-MM-dd`, không ở tương lai |
| `notaryAuthority`, `notarialDocumentNumber`, `notarizedAt` | string, string, date | không (PS-43 bắt buộc với NOTARIAL) | thông tin công chứng |
| `evidenceReference` | string | không | mã biên nhận/vị trí lưu hồ sơ giấy, tối đa 500 |
| `notes` | string | không | tối đa 1000 |

- **Server đặt:** phiên bản (`1` ở PS-41), SHA-256 của nội dung gốc, người tiếp nhận, thời điểm, `file_reference` (không nhận từ client).
  Nội dung file được **mã hóa** (AES-256-GCM, AAD = UUID phiên bản) và **không có API tải xuống**.
- Điều kiện: Staff đã nhận ca, ca `OPEN`, Vault `AWAITING_LEGAL_BASIS`, hồ sơ có nhánh `NOTARIAL`/`COURT` (`ON_HOLD` thì chưa nhận văn bản),
  loại văn bản đúng nhánh, chưa có phiên bản nào (phiên bản mới thuộc PS-42).
- Không đổi trạng thái Vault; hồ sơ chuyển `DRAFT → LEGAL_BASIS_PROVIDED`.

### 2.3 Response (`BasisDossierResponse`)

`id`, `caseId`, `route`, `status`, `disputeStatus`, `routeReason` (**chỉ Legal thấy**, Staff là `null`), `classifiedBy` (uuid Legal),
`createdAt`, `updatedAt`, `requiredVersion` (phiên bản tối thiểu cần nộp sau hold), `versions[]` (mới nhất trước). Mỗi phiên bản: `version`, `legalBasisType`, `issuingAuthority`, `documentNumber`,
`issueDate`, `notaryAuthority`, `notarialDocumentNumber`, `notarizedAt`, `evidenceReference`, `notes`, `contentType`, `sizeBytes`, `sha256`,
`forwardStatus` (`NOT_FORWARDED`/`FORWARDED`), `createdBy` (uuid Staff), `createdAt`, `forwardedAt`. Không có tên file hay nội dung.

## 3. Lỗi

| Tình huống | HTTP | Mã lỗi |
|---|---|---|
| Chưa đăng nhập | 401 | `UNAUTHENTICATED` |
| Sai role (Legal gọi API Staff và ngược lại, Owner) | 403 | `ACCESS_DENIED` |
| Thiếu hoặc sai trường, loại văn bản không khớp nhánh, thiếu phần `metadata`/`file` | 400 | `VALIDATION_FAILED` |
| Không có ca / ca không thuộc Staff / chưa có hồ sơ | 404 | `RESOURCE_NOT_FOUND` |
| Chưa có kết quả đối chiếu di chúc khớp | 409 | `WILL_NOT_VERIFIED` |
| Phiên bản chuyển không phải mới nhất | 409 | `BASIS_VERSION_STALE` |
| Ca đã có hồ sơ | 409 | `BASIS_DOSSIER_ALREADY_EXISTS` |
| Ca/Vault/hồ sơ không ở trạng thái cho phép (ca đã hủy, Vault sai trạng thái, nhánh `ON_HOLD`, đã có phiên bản) | 409 | `BASIS_DOSSIER_INVALID_STATE` |
| File không phải PDF/JPEG/PNG | 415 | `UNSUPPORTED_MEDIA_TYPE` |
| File vượt giới hạn | 413 | `PAYLOAD_TOO_LARGE` |

## 4. Audit và khóa

- `LEGAL_BASIS_CLASSIFIED` (ST-16): nhánh, tình trạng tranh chấp, ID công khai; trạng thái Vault trước/sau đi qua `stateBefore/After`. **Không** ghi `routeReason`.
- `LEGAL_BASIS_RECEIVED` (ST-18): loại văn bản, phiên bản, `sha256`, kích thước, ID công khai. **Không** ghi số văn bản, cơ quan, ghi chú hay tên file.
- Phân loại khóa dòng **Vault → ca** (như Cancel Alert, PS-36, PS-40); tiếp nhận/chuyển/hold khóa Vault → ca → hồ sơ và refresh trạng thái sau khóa. Lưu và audit cùng một giao dịch.
- Phiên bản chỉ thêm mới; không có API sửa hay xóa.

PS-46 dùng lại API phân loại/phân loại lại ở trên, không tạo endpoint song song. Sau khi khóa
Vault → ca → hồ sơ, Backend refresh trạng thái từ SQL Server trước khi kiểm tra điều kiện;
entity cũ trong persistence context không được bỏ qua ca đã hủy hoặc Vault đã chuyển trạng thái.
`routeReason` được giữ trong hồ sơ/lịch sử và chỉ trả cho Legal, không đưa vào audit.

Kiểm chứng PS-46: `LegalRouteSqlServerTest` tạo DB ngẫu nhiên từ `LEGAL_SQLSERVER_MASTER_URL`
(JDBC URL tới `master`), chạy Flyway thật và xóa riêng DB đó sau test. Các tình huống gồm cả ba
nhánh, thiếu đối chiếu MATCH, tạo hồ sơ đồng thời, ca cache cũ sau hủy và rollback khi audit lỗi.

## 5. Kiểm chứng và giới hạn

PS-46–48 đã kiểm chứng trên SQL Server thật bằng DB tạm, gồm Flyway toàn nhánh,
phân loại đồng thời, tiếp nhận file mã hóa, chuyển phiên bản, kết luận COURT và hold/resume/re-review.
Lượt Maven clean test cuối trên develop `2a1ad38`: 352 test được phát hiện, 349 pass,
0 failure/error, 3 test DMS opt-in cũ bỏ qua. Đã bật cả SQL suite Staff/identity: 53 SQL tests pass. Ba bộ SQL mới chạy đủ 23 test (5 route, 6 court, 12 hold), không có test bị bỏ qua.
Các DB thử nghiệm đã được đóng/xóa; không sửa Flyway history của DB dùng chung.
Nội dung file vẫn không có API tải xuống dành cho Legal; thẩm định giấy tờ thuộc trách nhiệm của Legal.

## 6. Chuyển văn bản cho Legal — PS-42 (ST-19)

- Điều kiện: Staff sở hữu ca, ca `OPEN`, Vault `AWAITING_LEGAL_BASIS`, hồ sơ `LEGAL_BASIS_PROVIDED`. `version` phải **bằng phiên bản mới nhất**, nếu không `409 BASIS_VERSION_STALE`; số ngoài phạm vi trả `404`.
- Kết quả: phiên bản được đánh dấu đã chuyển (cập nhật có điều kiện, chống chuyển đôi), hồ sơ `LEGAL_BASIS_FORWARDED`, Vault `LEGAL_BASIS_VERIFICATION`. Phiên bản cũ không bị sửa hay xóa.
- Khóa dòng: đọc ca không khóa → khóa Vault → khóa ca → khóa hồ sơ (Vault → ca → bản ghi con). Audit `LEGAL_BASIS_FORWARDED` (ST-19) cùng giao dịch.
- Kế hoạch phân bổ (tài sản - người nhận) được gửi trong `metadata.allocations` ở bước tiếp nhận, gắn với từng phiên bản; thay đổi phiên bản đồng nghĩa phân bổ mới.
- PS-48 cho phép Legal đưa hồ sơ về hold khi thiếu chứng cứ/tranh chấp mới, rồi resume để Staff nộp và chuyển phiên bản mới. Phiên bản cũ không bị ghi đè.

## 7. Phân loại lại và thông tin công chứng — PS-43

- **Phân loại lại (LV-HOLD-001):** body giống ST-16 (`route`, `routeReason`) nhưng `route` chỉ được `NOTARIAL` hoặc `COURT`; `ON_HOLD` hoặc lý do trống trả `400`. Điều kiện: ca `OPEN`, Vault `ON_HOLD`, hồ sơ nhánh `ON_HOLD` và còn `DRAFT`, đối chiếu di chúc không bị chặn (`WILL_NOT_VERIFIED`). Sai điều kiện trả `409 BASIS_DOSSIER_INVALID_STATE`.
- **Không đổi `COURT` ↔ `NOTARIAL`:** hồ sơ đã ở nhánh `NOTARIAL`/`COURT` không thể phân loại lại, kể cả khi lời khai của Trustee thay đổi (D-LEGAL-002); thay đổi như vậy phải đi qua `ON_HOLD` do Legal ghi nhận qua API PS-48.
- `NOTARIAL` đặt `disputeStatus = NONE`, `COURT` đặt `DISPUTED`. Lý do và chứng cứ của lần phân loại cũ được lưu vào `legal_basis_classification_history` (V15), không ghi đè; `classifiedBy` trả Legal của lần phân loại hiện hành.
- Kết quả: Vault `ON_HOLD` → `AWAITING_LEGAL_BASIS` (qua `LEGAL_BASIS_CLASSIFICATION`); audit `LEGAL_BASIS_RECLASSIFIED` (ST-16, LV-HOLD-001), không ghi lý do. Khóa Vault → ca → hồ sơ.
- **Thông tin công chứng (LV-NOTARY-001):** tiếp nhận văn bản nhánh `NOTARIAL` bắt buộc `notaryAuthority`, `notarialDocumentNumber` và `notarizedAt`; thiếu thì `400`. Văn bản `COURT` đã yêu cầu cơ quan, số và ngày ban hành.
- PS-48 bổ sung API `/hold`, giữ lịch sử và yêu cầu phiên bản mới; PS-47 bổ sung kết luận COURT theo phiên bản. Migration V15–V17 đã chạy trong các test SQL Server dùng DB tạm. Ký duyệt/unlock/handover thuộc các ticket sau Sprint 2.

## 8. Legal review và yêu cầu bổ sung — PS-37 (ST-20, LV-BASIS-001/LV-HOLD-001)

Hai endpoint chỉ dành cho role `LEGAL_VERIFIER`; `caseId` là UUID công khai của verification case. `reviewerUserId` lấy từ principal phía server, không nhận từ request.

### 8.1 POST hoàn thành review

`POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/review`

Request body (`application/json`):

```json
{
  "reason": "Đã kiểm tra phiên bản hồ sơ và các chứng cứ liên quan."
}
```

| Trường | Kiểu | Bắt buộc | Quy tắc |
|---|---|---|---|
| `reason` | string | Có | Không rỗng/không chỉ chứa khoảng trắng; tối đa 1000 ký tự |

Response `200 OK`: `LegalBasisReviewResponse`.

### 8.2 POST yêu cầu bổ sung

`POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/request-supplementation`

Request body giống endpoint `/review`, dùng `reason` bắt buộc, tối đa 1000 ký tự. Response `200 OK`: `LegalBasisReviewResponse`. Khi thành công, dossier được đánh dấu cần review lại với reason code `LEGAL_REQUESTED_SUPPLEMENTATION`; việc chuyển trạng thái Vault/dossier tuân theo service và workflow hiện hành.

### 8.3 Response — `LegalBasisReviewResponse`

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `dossierId` | string / UUID | Public ID của dossier; không trả khóa chính tuần tự trong database theo D-API-08 |
| `reviewStatus` | string | Trạng thái review hiện tại |
| `reviewRequired` | boolean | Dossier có cần review hay không |
| `reasonCode` | string / nullable | Mã lý do review hoặc kết quả kiểm tra |
| `reason` | string / nullable | Lý do nghiệp vụ được trả về |
| `currentVersionNo` | integer / nullable | Phiên bản hiện tại |
| `currentSha256Hash` | string / nullable | Hash SHA-256 hiện tại |
| `currentDisputeStatus` | string / nullable | Trạng thái tranh chấp hiện tại |
| `currentAllocationHash` | string / nullable | Hash phạm vi phân bổ hiện tại |
| `checkedAt` | string, date-time | Thời điểm kiểm tra |

### 8.4 Mã lỗi

| HTTP | `code` | Tình huống |
|---|---|---|
| `400` | `VALIDATION_FAILED` | `reason` thiếu, rỗng/chỉ có khoảng trắng hoặc dài hơn 1000 ký tự |
| `401` | `UNAUTHENTICATED` | Chưa đăng nhập hoặc token không hợp lệ |
| `403` | `ACCESS_DENIED` | Đã đăng nhập nhưng không có role `LEGAL_VERIFIER` |
| `404` | `RESOURCE_NOT_FOUND` | Không tìm thấy ca, Vault hoặc dossier liên quan |
| `409` | `VERIFICATION_CASE_NOT_OPEN` | Verification case không ở trạng thái `OPEN` |
| `409` | `BASIS_DOSSIER_INVALID_STATE` | Vault/dossier không ở trạng thái cho phép review hoặc đang bị hold |

Các lỗi dùng cấu trúc `ApiError` chung; FE phân loại bằng `code`, không dựa vào `message`.

### 8.5 Audit và migration

- `LEGAL_BASIS_REVIEW_RECORDED`: ghi nhận Legal hoàn thành review; context chứa reason code `REVIEW_COMPLETED`; audit phải gắn `vaultId` khi Vault đã được xác định.
- `LEGAL_BASIS_REVIEW_REQUIRED`: ghi nhận dossier cần review lại hoặc Legal yêu cầu bổ sung; context chứa reason code, không thay thế audit bằng cách ghi đè lịch sử review; audit phải gắn `vaultId` khi Vault đã được xác định.
- Thay đổi trạng thái, review history và audit phải commit trong cùng transaction.
- Migration cho phần revalidation/review phải dùng `V18__legal_basis_review_revalidation.sql` nếu V16 chưa được merge/chạy trên môi trường dùng chung và nhóm đã thống nhất dành V18 cho PS-37. Không đổi tên migration đã áp dụng; nếu V16 đã chạy, giữ nguyên lịch sử Flyway và thống nhất một migration bổ sung riêng trước khi triển khai.

