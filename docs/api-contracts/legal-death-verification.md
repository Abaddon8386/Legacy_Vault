# Thẩm định giấy tờ khai tử của Legal — PS-36 (ST-12, LV-DEATH-002)

**Trạng thái:** đã triển khai trên nhánh `feature/PS-36-legal-death-verification` (đối chiếu với code tại commit `bc33584`).

- **Business rule:** `LV-DEATH-002`, bước `ST-12`.
- **Vai trò:** chỉ `LEGAL_VERIFIER` (`@PreAuthorize("hasRole('LEGAL_VERIFIER')")` ở cấp class).
- **Base path:** `/api/v1/legal-verifications/death-documents`.
- **Kiểm chứng:** toàn bộ bộ test Maven trên nhánh có 206 test, chỉ `contextLoads` lỗi vì cần SQL Server. Chưa chạy trên
  SQL Server thật, xem [mục 8](#8-kiểm-chứng-và-giới-hạn).

## 1. Quy tắc nghiệp vụ

- Legal Verifier thẩm định giấy chứng tử / trích lục khai tử do Staff đã ghi nhận ở ST-11 ([PS-38](staff-verification.md)).
- DMS hết hạn hoặc Vault sang `AWAITING_VERIFICATION` **không** là bằng chứng tử vong; Legal phải xem chứng cứ và quyết định có lý do.
- Ba quyết định: chấp thuận (`APPROVE`), từ chối (`REJECT`), yêu cầu bổ sung (`REQUEST_MORE`). Mỗi quyết định lưu người ra quyết
  định, thời điểm, kết quả, lý do (`legal_verifications`) và ghi audit.
- **Mỗi giấy tờ chỉ có một quyết định.** Bị từ chối hoặc yêu cầu bổ sung thì Staff ghi nhận **giấy tờ mới** (PS-38), không
  quyết định lại giấy tờ cũ.
- **Chỉ `APPROVE`** chuyển Vault `AWAITING_VERIFICATION → DOCUMENT_VERIFICATION`. Ca xác minh vẫn `OPEN`. **Không** mở khóa,
  không giải mã, không cấp quyền cho ai (LV-DEATH-001, LV-BASIS-001); các bước pháp lý sau đó vẫn theo workflow.
- Chỉ quyết định được khi ca còn `OPEN` **và** Vault đang `AWAITING_VERIFICATION`.

## 2. Các endpoint

| Method | Đường dẫn | Mô tả | Lỗi |
|---|---|---|---|
| `POST` | `/{deathDocumentPublicId}/decision` | Ghi quyết định (ST-12) | `400` `401` `403` `404` `409` |
| `GET` | `/{deathDocumentPublicId}` | Chi tiết giấy tờ, trạng thái ca/Vault và lịch sử quyết định | `401` `403` `404` |

`deathDocumentPublicId` là UUID công khai của bản ghi giấy tờ khai tử (`id` trong response PS-38). Mọi ID trong request và
response đều là UUID công khai, thời gian là ISO-8601 UTC có hậu tố `Z` (conventions.md §2).

## 3. POST `/{deathDocumentPublicId}/decision`

### 3.1 Request

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `decision` | enum | có | `APPROVE`, `REJECT` hoặc `REQUEST_MORE` |
| `reason` | string | có | không rỗng, tối đa 1000 ký tự (sau `trim`) |

```json
{ "decision": "REJECT", "reason": "Hồ sơ chưa đủ căn cứ để xác nhận tính hợp lệ." }
```

Validation xảy ra hai lớp: controller (`@Valid`, lỗi theo trường trong `errors[]`) và service (kiểm tra lại, gồm cả
`reason` rỗng hoặc quá dài sau `trim`). Giá trị `decision` ngoài enum, thiếu `reason`, hoặc thiếu `decision` đều trả `400`
(test controller khẳng định HTTP 400; mã lỗi cụ thể theo [error-contract.md](error-contract.md)).

### 3.2 Ánh xạ quyết định

| `decision` | `result` lưu | Hiệu ứng |
|---|---|---|
| `APPROVE` | `APPROVED` | Vault → `DOCUMENT_VERIFICATION` |
| `REJECT` | `REJECTED` | Không đổi Vault, không đóng ca |
| `REQUEST_MORE` | `NEEDS_CORRECTION` | Không đổi Vault, không đóng ca |

### 3.3 Response 200 (`LegalDeathDecisionResponse`)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `deathDocumentPublicId` | uuid | |
| `verificationCasePublicId` | uuid | |
| `result` | string | `APPROVED`, `REJECTED` hoặc `NEEDS_CORRECTION` |
| `verifierPublicId` | uuid | Legal Verifier đã quyết định (người đăng nhập) |
| `decidedAt` | date-time | UTC, có `Z` |
| `reason` | string | lý do đã lưu |
| `verificationCaseStatus` | string | trạng thái ca sau quyết định (vẫn `OPEN`) |
| `vaultStatus` | string | trạng thái Vault sau quyết định |

```json
{
  "deathDocumentPublicId": "7a2b5d3e-0000-4000-8000-000000000002",
  "verificationCasePublicId": "6f1a4c2d-0000-4000-8000-000000000001",
  "result": "APPROVED",
  "verifierPublicId": "0e8d2f10-0000-4000-8000-000000000009",
  "decidedAt": "2026-10-17T03:30:00Z",
  "reason": "Đã kiểm tra hồ sơ chứng tử và căn cứ kèm theo.",
  "verificationCaseStatus": "OPEN",
  "vaultStatus": "DOCUMENT_VERIFICATION"
}
```

Response **không** có ID nội bộ (`Long`) như `verificationId`; trường lý do tên là `reason`, không phải `remarks`.

## 4. GET `/{deathDocumentPublicId}`

Cho Legal xem metadata giấy tờ, trạng thái hiện tại và lịch sử quyết định trước khi thẩm định. Chỉ đọc, `@Transactional(readOnly)`,
không ghi audit, **không** giới hạn theo trạng thái ca/Vault (Legal xem được cả khi ca đã hủy hay đã quyết định).

### Response 200 (`LegalDeathDocumentDetailResponse`)

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `deathDocumentPublicId` | uuid | |
| `verificationCasePublicId` | uuid | |
| `verificationCaseStatus` | string | `OPEN` hoặc `CANCELLED` |
| `vaultStatus` | string | trạng thái Vault hiện tại |
| `document` | object | metadata giấy tờ, bảng dưới |
| `decisions` | array | lịch sử quyết định, **mới nhất trước**; rỗng nếu chưa quyết định |

`document`:

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `documentType` | string | `DEATH_CERTIFICATE` hoặc `DEATH_REGISTRATION_EXTRACT` |
| `issuingAuthority`, `documentNumber` | string | như Staff đã ghi nhận |
| `issuedDate` | date | `yyyy-MM-dd` |
| `receivedByPublicId` | uuid | Staff đã nhận giấy tờ |
| `receivedAt`, `createdAt` | date-time | UTC, có `Z` |
| `evidenceReference`, `notes` | string hoặc null | |

Mỗi phần tử `decisions`: `result`, `verifierPublicId` (uuid, có thể `null` nếu chưa quyết định), `requestedAt`, `decidedAt`
(date-time hoặc `null`), `reason`.

```json
{
  "deathDocumentPublicId": "7a2b5d3e-0000-4000-8000-000000000002",
  "verificationCasePublicId": "6f1a4c2d-0000-4000-8000-000000000001",
  "verificationCaseStatus": "OPEN",
  "vaultStatus": "AWAITING_VERIFICATION",
  "document": {
    "documentType": "DEATH_CERTIFICATE",
    "issuingAuthority": "UBND Phường Bến Nghé",
    "documentNumber": "123/2026",
    "issuedDate": "2026-09-30",
    "receivedByPublicId": "10c3a1b2-0000-4000-8000-000000000010",
    "receivedAt": "2026-10-02T09:30:00Z",
    "evidenceReference": "BB-01",
    "notes": null,
    "createdAt": "2026-10-02T09:30:00Z"
  },
  "decisions": []
}
```

## 5. Lỗi

| Tình huống | HTTP | Mã lỗi |
|---|---|---|
| Chưa đăng nhập | 401 | `UNAUTHENTICATED` |
| Không phải `LEGAL_VERIFIER` (Staff, Owner...) | 403 | `ACCESS_DENIED` |
| Thiếu hoặc sai `decision`, thiếu/rỗng/quá dài `reason` | 400 | theo error-contract |
| Không có giấy tờ, ca hoặc Vault | 404 | `RESOURCE_NOT_FOUND` |
| Ca không còn `OPEN`, hoặc Vault không ở `AWAITING_VERIFICATION` | 409 | `LEGAL_VERIFICATION_INVALID_STATE` |
| Giấy tờ đã có quyết định | 409 | `LEGAL_VERIFICATION_ALREADY_DECIDED` |

Thông báo tiếng Việt của hai mã `409`: "Không thể thẩm định vì trạng thái vụ việc hoặc Vault không hợp lệ." và "Giấy tờ
chứng tử này đã có quyết định thẩm định." (cả vi và en nằm trong `messages*.properties`).

## 6. Audit, giao dịch và khóa

- Lưu quyết định (`saveAndFlush`) và ghi audit cùng một giao dịch `@Transactional`: audit lỗi thì **rollback** quyết định.
- Audit: `action = LEGAL_DEATH_DOCUMENT_DECIDED`, `entityType = LEGAL_VERIFICATION`, `stepId = ST-12`, `ruleId = LV-DEATH-002`,
  `stateBefore` = `PENDING`, `stateAfter` = kết quả. `AuditService` chuẩn hóa hai trạng thái này thành JSON
  (`{"status":"APPROVED"}`) để thỏa ràng buộc `ISJSON` của `audit_logs`.
- Metadata audit: `decision`, `deathDocumentPublicId`, `verificationCasePublicId`, `vaultStatusBefore`, `vaultStatusAfter`.
  **Không** ghi nguyên văn `reason` hay dữ liệu giấy tờ; lý do chỉ nằm ở `legal_verifications.remarks`.
- **Thứ tự khóa dòng: Vault → ca xác minh → bản ghi giấy tờ**, cùng thứ tự với Cancel Alert (PS-33) để không deadlock. Sau
  khi khóa, service kiểm tra lại quan hệ giấy tờ–ca–Vault. Có test `InOrder` giữ thứ tự này; đừng đảo.

## 7. Thành phần backend

| Thành phần | Vai trò |
|---|---|
| `LegalDeathVerificationController` (`verification.controller`) | Route, role, `@Valid` |
| `LegalDeathVerificationService` (`verification.service`) | Kiểm tra trạng thái, khóa, lưu quyết định, audit, đọc chi tiết |
| `LegalDeathDecisionRequest`, `LegalDeathDecisionResponse`, `LegalDeathDocumentDetailResponse` (`verification.dto`) | DTO |
| `LegalVerification` (`verification.entity`) | Kết quả, người quyết định, thời điểm, lý do (bảng `legal_verifications`, V11) |
| `DeathDocumentRecord`, `VerificationCase`, `Vault` | Giấy tờ (PS-38), ca (PS-34/35), trạng thái kho |

## 8. Kiểm chứng và giới hạn

Đã có (log Maven trên nhánh tại `bc33584`): 6 test controller (Staff 403, Owner 403, chưa đăng nhập 401, Legal đi qua, `decision`
sai 400, thiếu `reason` 400) và 14 test service (ba quyết định, ca đã hủy, Vault sai trạng thái, đã quyết định, lý do rỗng hoặc
quá 1000 ký tự, giấy tờ không tồn tại, thứ tự khóa, và bốn test `getDetail`).

Chưa kiểm chứng, **không** coi là đã đạt:

- Persistence, ràng buộc `ISJSON`, `CK_legal_verifications_*` và rollback khi audit lỗi trên **SQL Server thật** (test hiện mock audit).
- `GET` chưa có test ở tầng HTTP (quyền, 404).
- Khóa dòng khi Cancel Alert và quyết định chạy đồng thời chưa có test tích hợp.

Còn mở: chưa có API **liệt kê** ca/giấy tờ đang chờ Legal (Legal chỉ mở được khi đã có UUID); `getDetail` tra bảng `users` từng dòng
(có thể gom thành một truy vấn).

## 9. Phân biệt ST-11, ST-12 và PS-40

- **ST-11 / PS-38:** Staff ghi nhận metadata giấy tờ khai tử, không phê duyệt.
- **ST-12 / PS-36:** Legal thẩm định, quyết định `APPROVE`, `REJECT` hoặc `REQUEST_MORE`, lưu lý do và audit.
- **PS-40:** đối chiếu di chúc giấy gốc với phiên bản/hash di chúc số, lưu kết quả `MATCH`/`MISMATCH`.
- Tiếp nhận giấy tờ, quyết định pháp lý và mở khóa kho là các bước riêng biệt, không gộp thành một hành động.
