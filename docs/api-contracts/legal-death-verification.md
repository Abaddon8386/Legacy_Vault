# Legal Death Verification — PS-36 (ST-12)

Trạng thái: **unit test của `LegalDeathVerificationServiceTest` đã được người thực hiện xác nhận chạy ổn; controller/API runtime, HTTP status và tích hợp SQL Server cần được xác nhận bằng integration test hoặc request thực tế**. Chức năng thuộc Legal Verification; business rule chính: `LV-DEATH-002`.

## Quy tắc nghiệp vụ và phạm vi

- ST-12 do **Legal Verifier** thực hiện thẩm định giấy chứng tử / trích lục khai tử do Staff tiếp nhận ở ST-11.
- DMS hết hạn hoặc Vault chuyển sang `AWAITING_VERIFICATION` **không phải** bằng chứng xác nhận tử vong. Không được chỉ dựa vào DMS để duyệt.
- Legal phải xem xét chứng cứ và đưa ra quyết định có lý do: chấp thuận, từ chối hoặc yêu cầu bổ sung.
- Mỗi quyết định phải lưu người ra quyết định, thời điểm, kết quả và lý do; đồng thời ghi audit.
- Chặn quyết định khi verification case không còn `OPEN`, Vault không ở trạng thái phù hợp hoặc giấy tờ đã có quyết định trước đó.
- Quyết định chấp thuận hồ sơ chứng tử không đồng nghĩa tự động mở khóa/giải mã toàn bộ tài sản. Các bước pháp lý tiếp theo vẫn phải tuân theo workflow.
- Không ghi dữ liệu nhạy cảm của giấy tờ vào audit log; chỉ ghi thông tin định danh cần thiết cho truy vết.
- Role cần thiết theo thiết kế: `ROLE_LEGAL_VERIFIER`. Việc controller thực tế có áp dụng role này cần xác nhận trong `LegalDeathVerificationController`.

## POST `/api/v1/legal-verifications/death-documents/{deathDocumentPublicId}/decision`

> **Lưu ý xác minh:** Đây là route được dùng trong tài liệu hướng dẫn API trước đó. Cần đối chiếu `@RequestMapping` / `@PostMapping` trong `LegalDeathVerificationController` của branch đang chạy trước khi coi là API contract đã xác nhận.

- **Mục đích:** Gửi quyết định pháp lý cho một bản ghi giấy tờ chứng tử.
- **Path parameter:** `deathDocumentPublicId` — UUID công khai của bản ghi giấy tờ chứng tử.
- **Authorization:** Chỉ Legal Verifier được thực hiện thao tác này; kiểm tra chính xác `@PreAuthorize` và cấu hình Spring Security trong source.
- **Request body:** `LegalDeathDecisionRequest`.

### Request fields

| Trường | Kiểu | Bắt buộc | Ý nghĩa / ràng buộc |
|---|---|---|---|
| `decision` | enum/string | Có | `APPROVE`, `REJECT` hoặc `REQUEST_MORE` |
| `reason` | string | Có | Lý do cho quyết định; không để trống theo business rule |

Ví dụ chấp thuận:

```json
{
  "decision": "APPROVE",
  "reason": "Đã kiểm tra hồ sơ chứng tử và căn cứ kèm theo."
}
```

Ví dụ từ chối:

```json
{
  "decision": "REJECT",
  "reason": "Hồ sơ chưa đủ căn cứ để xác nhận tính hợp lệ."
}
```

Ví dụ yêu cầu bổ sung:

```json
{
  "decision": "REQUEST_MORE",
  "reason": "Yêu cầu bổ sung chứng cứ về cơ quan cấp giấy tờ."
}
```

Tên trường, validation annotation và giới hạn độ dài phải đối chiếu với `LegalDeathDecisionRequest` trong source thực tế.

## Các quyết định

| Giá trị | Ý nghĩa | Kết quả nghiệp vụ |
|---|---|---|
| `APPROVE` | Chấp thuận hồ sơ chứng tử | Lưu kết quả `APPROVED`; ghi audit. Việc cập nhật trạng thái Vault phải theo đúng transition đã được triển khai và kiểm thử. |
| `REJECT` | Từ chối hồ sơ | Lưu kết quả `REJECTED` cùng lý do; ghi audit. |
| `REQUEST_MORE` | Yêu cầu bổ sung chứng cứ | Lưu kết quả `NEEDS_CORRECTION` cùng lý do; ghi audit. |

`REQUEST_MORE` là giá trị đầu vào của request; kết quả lưu trong response/entity theo test hiện tại là `NEEDS_CORRECTION`.

## Response

Service trả về `LegalDeathDecisionResponse`. Theo unit test hiện tại, response có ít nhất các trường:

| Trường | Kiểu dự kiến | Ý nghĩa |
|---|---|---|
| `result` | string/enum | Kết quả quyết định, ví dụ `APPROVED`, `REJECTED`, `NEEDS_CORRECTION` |
| `verificationCasePublicId` | UUID | ID công khai của verification case liên quan |

Ví dụ minh họa — cần đối chiếu record/DTO để xác nhận định dạng JSON thực tế:

```json
{
  "result": "APPROVED",
  "verificationCasePublicId": "6f1a4c2d-0000-4000-8000-000000000001"
}
```

## Kiểm tra nghiệp vụ và lỗi

| Tình huống | Kết quả nghiệp vụ / mã lỗi được unit test tham chiếu |
|---|---|
| Không tìm thấy giấy tờ chứng tử | `RESOURCE_NOT_FOUND` |
| Verification case không còn mở | `LEGAL_VERIFICATION_INVALID_STATE` |
| Vault không ở trạng thái cho phép quyết định | `LEGAL_VERIFICATION_INVALID_STATE` |
| Giấy tờ đã có quyết định | `LEGAL_VERIFICATION_ALREADY_DECIDED` |
| Request không hợp lệ hoặc thiếu lý do | Cần xác nhận validation DTO và global exception handler |
| Không có quyền Legal Verifier | HTTP `401`/`403` phụ thuộc authentication và Spring Security config |

Mã HTTP tương ứng cần được xác nhận qua controller integration test hoặc gọi API thật; unit test service không chứng minh HTTP status.

## Audit

Unit test hiện kiểm tra audit event với các thuộc tính:

- `action`: `LEGAL_DEATH_DOCUMENT_DECIDED`
- `actorUserId`: ID nội bộ của Legal Verifier đang đăng nhập
- `vaultId`: ID nội bộ của Vault liên quan
- `stepId`: `ST-12`
- `ruleId`: `LV-DEATH-002`
- `stateBefore`: `PENDING`
- `stateAfter`: kết quả quyết định, ví dụ `APPROVED`

Audit cần được ghi trong cùng transaction nghiệp vụ với quyết định. Nếu audit thất bại, cần xác minh transaction rollback bằng integration test trên SQL Server. Không ghi lý do nhạy cảm hoặc số giấy tờ vào audit nếu không có yêu cầu và kiểm soát phù hợp.

## Các thành phần backend liên quan

| Thành phần | Package / vị trí | Vai trò |
|---|---|---|
| `LegalDeathVerificationController` | `com.legacyvault.verification` hoặc package controller tương ứng — cần xác nhận source | Khai báo HTTP route, authorization và gọi service |
| `LegalDeathVerificationService` | `com.legacyvault.verification.service` | Xử lý quyết định, kiểm tra trạng thái, lưu dữ liệu và ghi audit |
| `LegalDeathDecisionRequest` | `com.legacyvault.verification.dto` | DTO đầu vào |
| `LegalDeathDecisionResponse` | `com.legacyvault.verification.dto` | DTO đầu ra |
| `LegalVerification` | `com.legacyvault.verification.entity` | Entity lưu quyết định xác minh |
| `DeathDocumentRecordRepository` | `com.legacyvault.verification.repository` | Truy vấn bản ghi giấy tờ chứng tử |
| `LegalVerificationRepository` | `com.legacyvault.verification.repository` | Kiểm tra quyết định đã tồn tại và lưu quyết định |
| `VerificationCaseRepository` | `com.legacyvault.verification.repository` | Truy vấn case và kiểm tra trạng thái |
| `VaultRepository` | `com.legacyvault.vault.repository` | Truy vấn Vault và trạng thái liên quan |
| `AuditService` | `com.legacyvault.audit` | Ghi audit event |

Package của Controller cần được xác nhận trực tiếp từ dòng `package` trong source; không suy ra chỉ từ tên class.

## Test và giới hạn xác minh

Unit test `LegalDeathVerificationServiceTest` bao phủ 7 trường hợp:

1. `APPROVE`: lưu quyết định, cập nhật xác minh tài liệu theo logic service và ghi audit.
2. `REJECT`: lưu quyết định từ chối, không gọi `markDocumentVerification()`.
3. `REQUEST_MORE`: lưu `NEEDS_CORRECTION`, không gọi `markDocumentVerification()`.
4. Case đã đóng: từ chối và không ghi audit.
5. Vault sai trạng thái: từ chối và không lưu quyết định.
6. Đã có quyết định: từ chối quyết định trùng.
7. Không tìm thấy giấy tờ: trả lỗi không tìm thấy.

Các điểm cần xác nhận trước khi đánh dấu API hoàn tất:

- [ ] Đối chiếu route và role thực tế trong controller.
- [ ] Kiểm tra `@Valid`, validation của `reason` và xử lý lỗi toàn cục.
- [ ] Xác nhận JSON request/response thực tế từ DTO.
- [ ] Chạy controller integration test hoặc Postman với tài khoản `ROLE_LEGAL_VERIFIER`.
- [ ] Chạy test tích hợp trên SQL Server để xác nhận transaction, audit, ràng buộc `ISJSON` và rollback khi audit thất bại.
- [ ] Xác nhận transition trạng thái Vault thực tế khi `APPROVE`; không mặc định rằng unit test mock đã chứng minh DB cập nhật đúng.
- [ ] Chỉ ghi nhận test pass khi có log Maven mới nhất.

## Phân biệt ST-11 và ST-12

- **ST-11 / PS-38:** Staff ghi nhận metadata giấy chứng tử đã tiếp nhận; không phê duyệt tính hợp lệ.
- **ST-12 / PS-36:** Legal Verifier thẩm định và quyết định `APPROVE`, `REJECT` hoặc `REQUEST_MORE`.
- Việc tiếp nhận giấy tờ, quyết định pháp lý và việc mở khóa Vault là các bước riêng biệt; không gộp thành một hành động.
