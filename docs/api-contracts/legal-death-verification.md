# Legal Death Verification --- PS-36 (ST-12)

**Trạng thái:** Unit test của `LegalDeathVerificationServiceTest` đã
được người thực hiện xác nhận chạy ổn. Controller/API runtime, HTTP
status và tích hợp SQL Server vẫn cần được xác nhận bằng integration
test hoặc request thực tế.

-   **Business rule:** `LV-DEATH-002`
-   **Phạm vi:** Legal Verification --- thẩm định giấy chứng tử/trích
    lục khai tử.
-   **Vai trò thực hiện:** `LEGAL_VERIFIER`

## 1. Quy tắc nghiệp vụ và phạm vi

-   ST-12 do **Legal Verifier** thực hiện thẩm định giấy chứng tử/trích
    lục khai tử do Staff tiếp nhận ở ST-11.
-   DMS hết hạn hoặc Vault chuyển sang `AWAITING_VERIFICATION` **không
    phải** bằng chứng xác nhận tử vong. Không được chỉ dựa vào DMS để
    duyệt.
-   Legal phải xem xét chứng cứ và đưa ra quyết định có lý do: chấp
    thuận, từ chối hoặc yêu cầu bổ sung.
-   Mỗi quyết định phải lưu người ra quyết định, thời điểm, kết quả và
    lý do; đồng thời ghi audit.
-   Chặn quyết định khi verification case không còn `OPEN`, Vault không
    ở trạng thái phù hợp hoặc giấy tờ đã có quyết định trước đó.
-   Quyết định chấp thuận hồ sơ chứng tử không đồng nghĩa tự động mở
    khóa/giải mã toàn bộ tài sản. Các bước pháp lý tiếp theo vẫn phải
    tuân theo workflow.
-   Không ghi dữ liệu nhạy cảm của giấy tờ hoặc nguyên văn lý do vào
    audit metadata; chỉ ghi thông tin định danh cần thiết cho truy vết.
-   Role dự kiến theo thiết kế là `ROLE_LEGAL_VERIFIER`. Quyền thực tế
    phải được xác nhận trong controller và cấu hình Spring Security.

## 2. API ghi quyết định

### `POST /api/v1/legal-verifications/death-documents/{deathDocumentPublicId}/decision`

> **Trạng thái contract:** Route này khớp với controller đã được cung
> cấp: `@RequestMapping("/api/v1/legal-verifications/death-documents")`
> và `@PostMapping("/{deathDocumentPublicId}/decision")`.

-   **Mục đích:** Gửi quyết định pháp lý cho một bản ghi giấy tờ chứng
    tử.
-   **Path parameter:** `deathDocumentPublicId` --- UUID công khai của
    bản ghi giấy tờ chứng tử.
-   **Authorization:** Controller đã được cung cấp có
    `@PreAuthorize("hasRole('LEGAL_VERIFIER')")`.
-   **Request DTO:** `LegalDeathDecisionRequest`.
-   **Response DTO:** `LegalDeathDecisionResponse`.

### 2.1 Request fields

  -----------------------------------------------------------------------
  Trường            Kiểu              Bắt buộc          Ý nghĩa / ràng
                                                        buộc
  ----------------- ----------------- ----------------- -----------------
  `decision`        enum              Có                `APPROVE`,
                                                        `REJECT` hoặc
                                                        `REQUEST_MORE`

  `reason`          string            Có                Lý do quyết định;
                                                        service từ chối
                                                        giá trị null,
                                                        rỗng sau trim
                                                        hoặc dài hơn 1000
                                                        ký tự
  -----------------------------------------------------------------------

Ví dụ chấp thuận:

``` json
{
  "decision": "APPROVE",
  "reason": "Đã kiểm tra hồ sơ chứng tử và căn cứ kèm theo."
}
```

Ví dụ từ chối:

``` json
{
  "decision": "REJECT",
  "reason": "Hồ sơ chưa đủ căn cứ để xác nhận tính hợp lệ."
}
```

Ví dụ yêu cầu bổ sung:

``` json
{
  "decision": "REQUEST_MORE",
  "reason": "Yêu cầu bổ sung chứng cứ về cơ quan cấp giấy tờ."
}
```

Các ví dụ là request mẫu; kiểu dữ liệu, annotation và giới hạn độ dài ở
tầng DTO cần đối chiếu trực tiếp với `LegalDeathDecisionRequest`.

### 2.2 Mapping quyết định

  -------------------------------------------------------------------------------------------
  Giá trị request         Kết quả lưu                    Hành vi theo service đã cung cấp
                          (`LegalVerification.result`)   
  ----------------------- ------------------------------ ------------------------------------
  `APPROVE`               `APPROVED`                     Gọi
                                                         `vault.markDocumentVerification()`

  `REJECT`                `REJECTED`                     Không gọi
                                                         `markDocumentVerification()`

  `REQUEST_MORE`          `NEEDS_CORRECTION`             Không gọi
                                                         `markDocumentVerification()`
  -------------------------------------------------------------------------------------------

Service hiện tại chỉ gọi `markDocumentVerification()` cho `APPROVE`.
Không được suy diễn rằng thao tác này mở khóa Vault; nó chuyển sang
luồng xác minh tài liệu theo logic của entity `Vault`.

### 2.3 Response

Service trả về `LegalDeathDecisionResponse`, được tạo với các giá trị
sau:

-   `deathDocumentPublicId`
-   `verificationCasePublicId`
-   `verificationId`
-   `result`
-   `verifierPublicId`
-   `decidedAt`
-   `remarks`/lý do theo tên component của DTO
-   `verificationCaseStatus`
-   `vaultStatus`

Tên JSON thực tế phụ thuộc tên component được khai báo trong
record/class `LegalDeathDecisionResponse`. Không coi ví dụ response là
contract cuối cùng nếu chưa đối chiếu DTO.

## 3. API đọc chi tiết hồ sơ --- phần cần triển khai/xác nhận

### `GET /api/v1/legal-verifications/death-documents/{deathDocumentPublicId}`

**Mục đích đề xuất:** Cung cấp dữ liệu chi tiết cho FE PS-28: metadata
giấy tờ chứng tử, trạng thái case/Vault và lịch sử quyết định.

**Trạng thái:** Đây là API đã được đề xuất trong quá trình trao đổi,
nhưng controller/service mà người dùng cung cấp hiện chỉ thể hiện phương
thức `decide()`. Vì vậy, **không ghi API GET là đã triển khai** cho đến
khi phương thức, DTO và test thực sự tồn tại trong branch.

Các dữ liệu nguồn có thể truy vấn từ những thành phần đã cung cấp:

-   `DeathDocumentRecord`: `documentType`, `issuingAuthority`,
    `documentNumber`, `issuedDate`, `receivedByUserId`, `receivedAt`,
    `evidenceReference`, `notes`, `createdAt`.
-   `LegalVerification`: `result`, `verifierUserId`, `requestedAt`,
    `decidedAt`, `remarks`.
-   `VerificationCase`: public ID, trạng thái và Vault liên quan, nếu
    getter tương ứng tồn tại trong source.
-   `Vault`: trạng thái hiện tại.

Repository đã được cung cấp có thể tái sử dụng:

``` java
deathDocumentRecordRepository.findByPublicId(deathDocumentPublicId);

legalVerificationRepository
    .findByDeathDocumentRecordIdOrderByRequestedAtDescVerificationIdDesc(
        deathDocumentRecordId
    );
```

Cần xác nhận getter và repository methods của `VerificationCase`/`Vault`
trong source trước khi hoàn thiện implementation.

### Response DTO đề xuất

`LegalDeathDocumentDetailResponse` --- package dự kiến
`com.legacyvault.verification.dto`.

Response nên có: - ID công khai của hồ sơ và verification case. - Trạng
thái case và Vault tách biệt. - Metadata giấy tờ cần thiết cho thẩm
định. - Danh sách quyết định, sắp xếp mới nhất trước; mỗi mục gồm kết
quả, lý do, người thực hiện và thời điểm.

**ID người thực hiện:** `LegalVerification.verifierUserId` là `Long` nội
bộ. Nếu FE cần UUID công khai hoặc tên người thẩm định, phải tra cứu
thông tin user và chốt contract; không được xem `Long` là UUID.

## 4. Xử lý lỗi

  --------------------------------------------------------------------------
  Tình huống                          Error code/HTTP cần xử lý
  ----------------------------------- --------------------------------------
  Không tìm thấy giấy tờ, case hoặc   Service dùng `RESOURCE_NOT_FOUND`;
  Vault                               HTTP status phụ thuộc global exception
                                      handler

  Verification case không còn mở      `LEGAL_VERIFICATION_INVALID_STATE`

  Vault không ở trạng thái            `LEGAL_VERIFICATION_INVALID_STATE`
  `AWAITING_VERIFICATION`             

  Hồ sơ đã có quyết định              `LEGAL_VERIFICATION_ALREADY_DECIDED`

  Request null, thiếu                 `VALIDATION_FAILED` trong service
  decision/reason, reason rỗng hoặc   
  dài hơn 1000 ký tự                  

  Người dùng chưa đăng nhập           HTTP status phụ thuộc authentication
                                      configuration

  Người dùng có role không phù hợp    Thông thường bị từ chối bởi Spring
                                      Security; phải xác nhận HTTP thực tế
                                      bằng controller test
  --------------------------------------------------------------------------

Unit test service không chứng minh HTTP status. Cần controller
integration test hoặc gọi API thực tế để xác nhận mapping lỗi.

## 5. Audit và transaction

Theo service đã cung cấp, quyết định được lưu bằng
`legalVerificationRepository.saveAndFlush(...)`, sau đó audit được ghi
qua `auditService.record(...)` trong cùng phương thức `@Transactional`.

Audit event sử dụng: - `action`: `LEGAL_DEATH_DOCUMENT_DECIDED` -
`actorUserId`: ID nội bộ của Legal Verifier - `vaultId`: ID nội bộ của
Vault - `entityType`: `LEGAL_VERIFICATION` - `stepId`: `ST-12` -
`ruleId`: `LV-DEATH-002` - `stateBefore`: `PENDING` - `stateAfter`: kết
quả, ví dụ `APPROVED`

Metadata hiện có `decision`, `deathDocumentPublicId`,
`verificationCasePublicId`, `vaultStatusBefore`, `vaultStatusAfter`;
không đưa nguyên văn `reason` vào metadata. Cần xác nhận trên SQL Server
rằng ràng buộc JSON của audit phù hợp dữ liệu được ghi và audit thất bại
sẽ rollback quyết định.

## 6. Các thành phần backend liên quan

  --------------------------------------------------------------------------------------------------------
  Thành phần                           Package / vị trí                            Vai trò
  ------------------------------------ ------------------------------------------- -----------------------
  `LegalDeathVerificationController`   `com.legacyvault.verification.controller`   Khai báo HTTP route,
                                       theo controller đã cung cấp                 role và gọi service

  `LegalDeathVerificationService`      `com.legacyvault.verification.service`      Kiểm tra trạng thái,
                                                                                   lưu quyết định và audit

  `LegalDeathDecisionRequest`          `com.legacyvault.verification.dto`          DTO đầu vào

  `LegalDeathDecisionResponse`         `com.legacyvault.verification.dto`          DTO đầu ra

  `LegalVerification`                  `com.legacyvault.verification.entity`       Lưu kết quả, actor,
                                                                                   thời điểm và lý do

  `DeathDocumentRecord`                `com.legacyvault.verification.entity`       Metadata giấy tờ chứng
                                                                                   tử

  `DeathDocumentRecordRepository`      `com.legacyvault.verification.repository`   Truy vấn giấy tờ

  `LegalVerificationRepository`        `com.legacyvault.verification.repository`   Kiểm tra quyết định
                                                                                   trùng và truy vấn lịch
                                                                                   sử

  `VerificationCaseRepository`         `com.legacyvault.verification.repository`   Truy vấn/khóa case

  `VaultRepository`                    package repository của Vault trong source   Truy vấn/khóa Vault

  `AuditService`                       package audit trong source                  Ghi audit event
  --------------------------------------------------------------------------------------------------------

Package nêu trên dựa trên các khai báo/import đã được cung cấp trong hội
thoại; nếu branch có cấu trúc khác, xác nhận theo dòng `package` thực
tế.

## 7. Test và giới hạn xác minh

Người thực hiện đã xác nhận `LegalDeathVerificationServiceTest` chạy ổn.
Điều này xác nhận unit test service theo môi trường người thực hiện,
**không đồng nghĩa** controller/API runtime hoặc SQL Server integration
đã đạt.

Các kiểm tra cần hoàn thành:

-   [ ] Xác nhận route và `@PreAuthorize` trong source đang chạy.
-   [ ] Xác nhận validation của `LegalDeathDecisionRequest`.
-   [ ] Kiểm tra JSON request/response thực tế từ DTO.
-   [ ] Kiểm tra role `LEGAL_VERIFIER`, role khác và request chưa xác
    thực bằng MockMvc.
-   [ ] Kiểm tra HTTP `400`, `401/403`, `404`, `409` theo global
    exception handler/security config.
-   [ ] Chạy integration test trên SQL Server để xác nhận persistence,
    audit, constraint `ISJSON` và rollback khi audit thất bại.
-   [ ] Xác nhận transition Vault thực tế khi `APPROVE`.
-   [ ] Chỉ đánh dấu pass sau khi có log Maven mới nhất.

## 8. Phân biệt ST-11, ST-12 và PS-40

-   **ST-11 / PS-38:** Staff tiếp nhận và ghi metadata giấy tờ chứng tử;
    không phê duyệt tính hợp lệ.
-   **ST-12 / PS-36:** Legal Verifier thẩm định, quyết định `APPROVE`,
    `REJECT` hoặc `REQUEST_MORE`, lưu lý do và audit.
-   **PS-40:** Đối chiếu di chúc giấy gốc với phiên bản/hash di chúc số
    và lưu kết quả `match/mismatch`.
-   Tiếp nhận giấy tờ, quyết định pháp lý và mở khóa Vault là các bước
    riêng biệt; không gộp thành một hành động.
