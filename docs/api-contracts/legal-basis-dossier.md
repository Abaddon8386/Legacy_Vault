# Hồ sơ căn cứ phân chia di sản — PS-41, PS-42, PS-43 (ST-16..19, LV-BASIS-001)

**Trạng thái:** PS-41 (phân loại của Legal, tiếp nhận văn bản của Staff) PS-42 (Staff chuyển văn bản cho Legal) và PS-43 (Legal phân loại lại từ ON_HOLD, kiểm tra thông tin công chứng) đã triển khai. Các quyết định thiết kế được ghi ở
[D-API-36](open-decisions.md); đó là cách đọc Main Flow v4.2 và `09_Decision_Legal_Basis_Branches.md`, chờ nhóm xác nhận.

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
`createdAt`, `updatedAt`, `versions[]` (mới nhất trước). Mỗi phiên bản: `version`, `legalBasisType`, `issuingAuthority`, `documentNumber`,
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
- Phân loại khóa dòng **Vault → ca** (như Cancel Alert, PS-36, PS-40); tiếp nhận khóa ca rồi hồ sơ. Lưu và audit cùng một giao dịch.
- Phiên bản chỉ thêm mới; không có API sửa hay xóa.

PS-46 dùng lại API phân loại/phân loại lại ở trên, không tạo endpoint song song. Sau khi khóa
Vault → ca → hồ sơ, Backend refresh trạng thái từ SQL Server trước khi kiểm tra điều kiện;
entity cũ trong persistence context không được bỏ qua ca đã hủy hoặc Vault đã chuyển trạng thái.
`routeReason` được giữ trong hồ sơ/lịch sử và chỉ trả cho Legal, không đưa vào audit.

Kiểm chứng PS-46: `LegalRouteSqlServerTest` tạo DB ngẫu nhiên từ `LEGAL_SQLSERVER_MASTER_URL`
(JDBC URL tới `master`), chạy Flyway thật và xóa riêng DB đó sau test. Các tình huống gồm cả ba
nhánh, thiếu đối chiếu MATCH, tạo hồ sơ đồng thời, ca cache cũ sau hủy và rollback khi audit lỗi.

## 5. Kiểm chứng và giới hạn

Đã có: test dịch vụ (phân loại 8, tiếp nhận 7, đọc hồ sơ 2), test controller (Legal 4, Staff 5), toàn bộ bộ test Maven chỉ `contextLoads` lỗi
(cần SQL Server). Migration `V14` đã qua kiểm tra cú pháp trên SQL Server thật (chỉ phân tích); **chưa chạy lưu thật** và chưa kiểm
chứng ràng buộc `CHECK`/chỉ mục duy nhất trên DB. Nội dung file mã hóa chưa có API giải mã cho Legal.

## 6. Chuyển văn bản cho Legal — PS-42 (ST-19)

- Điều kiện: Staff sở hữu ca, ca `OPEN`, Vault `AWAITING_LEGAL_BASIS`, hồ sơ `LEGAL_BASIS_PROVIDED`. `version` phải **bằng phiên bản mới nhất**, nếu không `409 BASIS_VERSION_STALE`; số ngoài phạm vi trả `404`.
- Kết quả: phiên bản được đánh dấu đã chuyển (cập nhật có điều kiện, chống chuyển đôi), hồ sơ `LEGAL_BASIS_FORWARDED`, Vault `LEGAL_BASIS_VERIFICATION`. Phiên bản cũ không bị sửa hay xóa.
- Khóa dòng: đọc ca không khóa → khóa Vault → khóa ca → khóa hồ sơ (Vault → ca → bản ghi con). Audit `LEGAL_BASIS_FORWARDED` (ST-19) cùng giao dịch.
- Kế hoạch phân bổ (tài sản - người nhận) được gửi trong `metadata.allocations` ở bước tiếp nhận, gắn với từng phiên bản; thay đổi phiên bản đồng nghĩa phân bổ mới.
- Giới hạn: chưa có bước Legal trả hồ sơ bổ sung (ST-20) nên sau khi chuyển, Vault rời `AWAITING_LEGAL_BASIS` và không thể nộp phiên bản mới cho tới khi PS thẩm định được làm.

## 7. Phân loại lại và thông tin công chứng — PS-43

- **Phân loại lại (LV-HOLD-001):** body giống ST-16 (`route`, `routeReason`) nhưng `route` chỉ được `NOTARIAL` hoặc `COURT`; `ON_HOLD` hoặc lý do trống trả `400`. Điều kiện: ca `OPEN`, Vault `ON_HOLD`, hồ sơ nhánh `ON_HOLD` và còn `DRAFT`, đối chiếu di chúc không bị chặn (`WILL_NOT_VERIFIED`). Sai điều kiện trả `409 BASIS_DOSSIER_INVALID_STATE`.
- **Không đổi `COURT` ↔ `NOTARIAL`:** hồ sơ đã ở nhánh `NOTARIAL`/`COURT` không thể phân loại lại, kể cả khi lời khai của Trustee thay đổi (D-LEGAL-002); thay đổi như vậy phải đi qua `ON_HOLD` do Legal ghi nhận (chưa có API riêng, xem giới hạn).
- `NOTARIAL` đặt `disputeStatus = NONE`, `COURT` đặt `DISPUTED`. Lý do và chứng cứ của lần phân loại cũ được lưu vào `legal_basis_classification_history` (V15), không ghi đè; `classifiedBy` trả Legal của lần phân loại hiện hành.
- Kết quả: Vault `ON_HOLD` → `AWAITING_LEGAL_BASIS` (qua `LEGAL_BASIS_CLASSIFICATION`); audit `LEGAL_BASIS_RECLASSIFIED` (ST-16, LV-HOLD-001), không ghi lý do. Khóa Vault → ca → hồ sơ.
- **Thông tin công chứng (LV-NOTARY-001):** tiếp nhận văn bản nhánh `NOTARIAL` bắt buộc `notaryAuthority`, `notarialDocumentNumber` và `notarizedAt`; thiếu thì `400`. Văn bản `COURT` đã yêu cầu cơ quan, số và ngày ban hành.
- Giới hạn: chưa có API đưa hồ sơ `NOTARIAL`/`COURT` trở lại `ON_HOLD` (LV-HOLD-001 khi có tranh chấp mới) và chưa có thẩm định/ký duyệt (ST-20, ST-21); migration V15 mới chỉ viết, **chưa chạy** trên SQL Server.
