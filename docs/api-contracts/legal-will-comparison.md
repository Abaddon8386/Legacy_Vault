# Đối chiếu di chúc giấy gốc với bản scan — PS-40 (ST-15, LV-WILL-001)

**Trạng thái:** đã triển khai (nhánh `feature/PS-40-will-original-comparison`). Các điểm là **đề xuất chờ nhóm xác nhận** được
ghi ở [D-API-35](open-decisions.md).

- **Vai trò:** chỉ `LEGAL_VERIFIER` (`@PreAuthorize("hasRole('LEGAL_VERIFIER')")`). Staff và Owner nhận `403`.
- **Base path:** `/api/v1/legal-verifications/verification-cases/{caseId}/will-comparisons` (`caseId` là UUID công khai của ca xác minh).

## 1. Quy tắc nghiệp vụ

- Legal đối chiếu **bản di chúc giấy gốc** mà Staff đã nhận ([PS-39](staff-verification.md)) với **một phiên bản bản scan** do Owner
  tải lên ([PS-17/18](wills.md)), rồi ghi kết quả. Việc so sánh (từng trang, nội dung, con dấu, chữ ký) là thao tác của người;
  hệ thống không tự so nội dung giấy và **không giải mã** bản scan.
- Mỗi kết quả lưu **phiên bản và SHA-256** của bản scan đã được so (hash do server lấy từ dữ liệu đã lưu, không nhận từ
  request). Hash chỉ xác định đúng phiên bản và phát hiện thay đổi, **không** chứng minh giá trị pháp lý.
- Ba kết quả: `MATCH`, `MISMATCH`, `INCONCLUSIVE` (chưa đủ cơ sở kết luận). `MISMATCH` và `INCONCLUSIVE` **bắt buộc có `reason`**.
- **Chặn luồng duyệt thông thường:** `approvalBlocked = true` cho tới khi kết quả đối chiếu **mới nhất** của ca là `MATCH`. Chưa
  đối chiếu, `MISMATCH` và `INCONCLUSIVE` đều chặn. Đối chiếu lại (sau khi bổ sung chứng cứ) là một bản ghi mới; bản ghi cũ giữ nguyên.
- Chỉ ghi nhận kết quả: không đóng ca, không mở khóa, không phê duyệt. **Kết quả `MATCH` đầu tiên chuyển Vault
  `DOCUMENT_VERIFICATION → WILL_VERIFICATION`** đúng ST-15 (Main Flow v4.2); `MISMATCH` và `INCONCLUSIVE` không đổi trạng thái.
  Cổng `approvalBlocked` dành cho các bước sau (phân loại ST-16, duyệt ST-21).
- Điều kiện ghi: ca `OPEN` **và** Vault `DOCUMENT_VERIFICATION` (Legal đã chấp thuận giấy tờ khai tử ở ST-12, PS-36) hoặc
  `WILL_VERIFICATION` (đối chiếu lại).

## 2. Endpoint

| Method | Mô tả | Lỗi |
|---|---|---|
| `GET` | Dữ liệu để đối chiếu: các lần nhận bản gốc, các bản scan kèm hash, kết quả đã có, cờ `approvalBlocked` | `401` `403` `404` |
| `POST` | Ghi một kết quả đối chiếu. `201` + `Location` (trỏ về collection) + `WillComparisonResponse` | `400` `401` `403` `404` `409` |

Mọi ID là UUID công khai, thời gian là ISO-8601 UTC có hậu tố `Z`; không có khóa nội bộ.

## 3. POST — request

| Trường | Kiểu | Bắt buộc | Ràng buộc |
|---|---|---|---|
| `originalWillIntakeId` | uuid | có | lần nhận bản gốc (`id` của PS-39), phải thuộc ca này |
| `willId` | uuid | có | hồ sơ di chúc (`id` của PS-17/18), phải thuộc Vault của ca |
| `version` | integer | có | `>= 1`, số phiên bản của di chúc đó |
| `result` | enum | có | `MATCH`, `MISMATCH` hoặc `INCONCLUSIVE` |
| `reason` | string | có nếu `result` khác `MATCH` | tối đa 1000 ký tự sau `trim` |

`sha256`, người đối chiếu (`checkedBy`) và `comparedAt` do server đặt; request gửi các trường này bị bỏ qua.

```json
{
  "originalWillIntakeId": "8b3c6e4f-0000-4000-8000-000000000003",
  "willId": "5d6e7f80-0000-4000-8000-000000000005",
  "version": 2,
  "result": "MISMATCH",
  "reason": "Trang 3 của bản gốc khác bản scan."
}
```

### Response 201 (`WillComparisonResponse`)

`id`, `caseId`, `originalWillIntakeId`, `willId`, `version`, `sha256` (hash phiên bản đã so), `result`, `checkedBy` (uuid Legal),
`reason`, `comparedAt`.

## 4. GET — response (`WillComparisonOverviewResponse`)

| Trường | Ghi chú |
|---|---|
| `caseId`, `vaultStatus` | ca và trạng thái Vault hiện tại |
| `approvalBlocked` | `true` trừ khi kết quả mới nhất là `MATCH` |
| `latestResult` | kết quả mới nhất, `null` nếu chưa đối chiếu |
| `originalWillIntakes[]` | `id`, `receivedAt`, `evidenceReference` (không gồm tên người giao) |
| `wills[]` | `id` và `versions[]`: `version`, `contentType`, `sizeBytes`, `sha256`, `uploadedAt` (không có tên file hay nội dung) |
| `comparisons[]` | các `WillComparisonResponse`, **mới nhất trước** |

`wills` trả tối đa 100 hồ sơ di chúc mới nhất của Vault.

## 5. Lỗi

| Tình huống | HTTP | Mã lỗi |
|---|---|---|
| Chưa đăng nhập | 401 | `UNAUTHENTICATED` |
| Không phải `LEGAL_VERIFIER` | 403 | `ACCESS_DENIED` |
| Thiếu trường, `result` ngoài enum, `version < 1`, UUID sai định dạng, `reason` quá dài | 400 | `VALIDATION_FAILED` / `MALFORMED_REQUEST` |
| `MISMATCH` hoặc `INCONCLUSIVE` thiếu `reason` | 400 | `VALIDATION_FAILED` |
| Không có ca, lần nhận bản gốc, di chúc hoặc phiên bản (hoặc không thuộc ca/Vault này) | 404 | `RESOURCE_NOT_FOUND` |
| Ca không còn `OPEN`, hoặc Vault không ở `DOCUMENT_VERIFICATION` | 409 | `LEGAL_VERIFICATION_INVALID_STATE` |

## 6. Audit, giao dịch và khóa

- Lưu kết quả và audit cùng một giao dịch: audit lỗi thì rollback kết quả.
- Audit: `WILL_COMPARISON_RECORDED`, `entityType = WILL_COMPARISON`, `stepId = ST-15`, `ruleId = LV-WILL-001`. Metadata:
  `result`, `verificationCaseId`, `originalWillIntakeId`, `willId`, `version`, `sha256`. **Không** ghi `reason`.
- Thứ tự khóa dòng **Vault → ca xác minh**, cùng thứ tự với Cancel Alert và quyết định chứng tử (PS-36). Có test `InOrder`.
- Bản ghi chỉ thêm mới và đọc (bảng `will_comparisons`); không có API sửa hay xóa.

## 7. Kiểm chứng và giới hạn

Đã có (Maven trên nhánh): 11 test dịch vụ (MATCH lưu đúng hash lấy từ dữ liệu đã lưu, MISMATCH, thiếu lý do, ca đã hủy, Vault sai
trạng thái, bản gốc/di chúc/phiên bản không thuộc ca, thứ tự khóa, cổng `approvalBlocked` đủ 4 trường hợp, overview) và 4 test
controller (201, 400, 401/403/404/409, GET). Truy vấn JPQL mới được Hibernate chấp nhận (`JpaMappingTest`).

Chưa kiểm chứng: lưu vào **SQL Server thật** (ràng buộc `CK_will_comparisons_result`, khóa ngoại) vì test mock repository và audit.

Còn mở:

- **Legal chưa có cách xem nội dung bản scan** để đối chiếu (chỉ có hash). Việc Legal đọc/tải file di chúc cần nhóm chốt.
- Cổng `approvalBlocked` được dùng khi phân loại căn cứ (ST-16, PS-41); chưa dùng ở bước duyệt ST-21.
- Không có API liệt kê các ca đang chờ Legal; Legal cần biết `caseId` từ nơi khác.

## 8. Phân biệt các bước

- **ST-13 / PS-39:** Staff ghi nhận đã nhận bản giấy gốc, không xác nhận hợp lệ.
- **ST-15 / PS-40:** Legal đối chiếu bản gốc với bản scan, ghi `MATCH`/`MISMATCH`/`INCONCLUSIVE` kèm phiên bản và hash.
- Duyệt căn cứ phân chia và mở khóa là các bước riêng (ST-16..22), không thuộc PS-40.
