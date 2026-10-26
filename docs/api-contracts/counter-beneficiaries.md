# Beneficiary của ca tại quầy — PS-88 (ST-14, ST-24, LV-ID-001)

**Trạng thái:** đã triển khai. Quyết định thiết kế ở [D-API-39](open-decisions.md), chờ nhóm xác nhận.

## 1. Mục đích

FE Staff (PS-90, PS-95, PS-97) cần dữ liệu **đọc** để chọn đúng Beneficiary của ca đang phục vụ và biết bước tiếp theo, thay vì nhập UUID thủ công hay gọi API của Owner.
PS-88 bổ sung phần đọc đó và giữ nguyên các API ghi đã có: xác minh tại quầy (PS-45), liên kết/tạo tài khoản ([PS-62/63](beneficiary-accounts.md)), mã mời của Owner ([PS-86](beneficiary-invitations.md)).

## 2. Endpoint

Chỉ `STAFF_EXECUTOR`; role khác `403`, chưa đăng nhập `401`. Mọi ID là UUID công khai. Phản hồi có `Cache-Control: no-store`.

| Method | Đường dẫn | Mô tả |
|---|---|---|
| `GET` | `/api/v1/staff/verification-cases/{caseId}/beneficiaries` | Danh sách Beneficiary của kho thuộc ca |
| `GET` | `/api/v1/staff/verification-cases/{caseId}/beneficiaries/{beneficiaryId}` | Một Beneficiary |

Staff phải được giao ca và ca còn `OPEN`. Ca khác, ca chưa nhận, ca đã hủy/đóng, ca không tồn tại, hoặc Beneficiary của kho khác đều trả `404 RESOURCE_NOT_FOUND`.

## 3. Phản hồi

```json
{
  "beneficiaryId": "uuid", "caseId": "uuid", "fullName": "Nguyễn Văn A", "relationship": "Con",
  "identityVerificationStatus": "VERIFIED_AT_COUNTER", "accountStatus": "NOT_CREATED", "accountLinked": false,
  "invitation": { "state": "PENDING", "expiresAt": "2026-10-27T08:00:00Z", "generation": 1 },
  "counterAttestation": { "recorded": true, "recordedAt": "2026-10-21T02:00:00Z", "confirmedEmailRecorded": true },
  "counterStep": "AWAITING_ACCOUNT_DECISION",
  "actions": { "canLinkAccount": true, "canCreateAccount": true, "canHandOverWithoutAccount": true, "canRequestInvitationEmail": false }
}
```

| Trường | Giá trị |
|---|---|
| `invitation.state` | `NOT_ISSUED` (Owner chưa phát mã), `PENDING`, `EXPIRED`, `REVOKED`, `CONSUMED` |
| `invitation.generation` | `0` khi chưa phát mã; là `expectedGeneration` khi gọi `POST …/invitation-email` |
| `counterAttestation` | `recorded` (Staff đã ghi nhận đối chiếu tại quầy qua `POST …/identity-attestations`), `recordedAt`, `confirmedEmailRecorded`. **Không** trả bằng chứng hay email. Đây là ghi nhận trách nhiệm nghiệp vụ của Staff, không phải hệ thống tự xác minh danh tính |
| `actions.canRequestInvitationEmail` | `true` khi đã `VERIFIED_AT_COUNTER`, chưa liên kết, attestation có email đã xác nhận và chưa có mã gắn email/chưa dùng. Chỉ phản ánh điều kiện rẻ; server vẫn kiểm tra lại phê duyệt Legal, mở khóa và phạm vi phân bổ |
| `counterStep` | `AWAITING_IDENTITY_VERIFICATION` (chưa `VERIFIED_AT_COUNTER`), `AWAITING_ACCOUNT_DECISION` (đã xác minh, chưa có tài khoản), `ACCOUNT_LINKED` |
| `actions.canLinkAccount` / `canCreateAccount` | `true` khi đã xác minh tại quầy và chưa có tài khoản |
| `actions.canHandOverWithoutAccount` | `true` khi đã xác minh tại quầy (không cần tài khoản để nhận bàn giao) |

Không trả email, số điện thoại, số giấy tờ, mã mời hay mã băm. `actions` chỉ là **gợi ý hiển thị**: server kiểm tra lại mọi điều kiện (ca, xác minh, liên kết, Legal) khi Staff thực hiện thao tác thật.

## 4. Các trường hợp tại quầy

| Tình huống | Trạng thái đọc được | Xử lý |
|---|---|---|
| Chưa xác minh trực tiếp | `AWAITING_IDENTITY_VERIFICATION`, mọi `actions` = false | Staff ghi nhận xác minh trước (PS-45) |
| Đã xác minh, chưa có mã mời | `AWAITING_ACCOUNT_DECISION`, `invitation.state = NOT_ISSUED` | Staff tạo tài khoản hoặc liên kết tài khoản có sẵn; hoặc tiếp tục bàn giao không cần tài khoản |
| Đã xác minh, có mã mời chưa dùng | `invitation.state = PENDING` | Như trên; khi Staff liên kết/tạo tại quầy, mã `PENDING` bị thu hồi (xem `beneficiary-accounts.md`) |
| Đã liên kết | `ACCOUNT_LINKED`, `canLinkAccount/canCreateAccount = false` | Không ghi đè liên kết; chuyển sang bàn giao |
| Người nhận không dùng tài khoản | `AWAITING_ACCOUNT_DECISION`, `canHandOverWithoutAccount = true` | Không ép tạo tài khoản; chưa có API ghi nhận riêng lựa chọn này |

## 5. Nguồn xác nhận tại quầy và guard trước khi gửi mã (D-API-46)

Theo quyết định 20/10: xác minh danh tính do Staff làm **ngoài hệ thống** bằng giấy tờ gốc; hệ thống không có màn xác minh/OCR/upload giấy tờ, và việc nhận mã hay liên kết tài khoản **không** phải là đã xác minh. FE chỉ hiển thị nguồn dưới đây, không tự suy ra `VERIFIED_AT_COUNTER`.

| Thông tin | Nguồn ghi nhận | API |
|---|---|---|
| Staff đã đối chiếu tại quầy, số tham chiếu chứng từ, email người nhận đã xác nhận | `beneficiary_counter_attestations` (bất biến, Staff gán ca) | `POST /api/v1/staff/verification-cases/{caseId}/beneficiaries/{beneficiaryId}/identity-attestations` |
| Trạng thái `identityVerificationStatus` | PS-45 (`IdentityVerificationController`) | `POST /api/v1/staff/beneficiaries/{beneficiaryId}/identity-verifications` |
| Yêu cầu gửi mã qua email | Outbox mã hóa + mã mời gắn đúng email đã xác nhận | `POST /api/v1/staff/verification-cases/{caseId}/beneficiaries/{beneficiaryId}/invitation-email` |

`POST …/invitation-email` (body `{ "expectedGeneration": n }`) kiểm tra lại **trong transaction, không tin cờ từ FE**: (1) Staff được giao ca và ca còn `OPEN`; (2) Legal đã phê duyệt và kho đã mở khóa cho bàn giao; (3) Beneficiary thuộc đúng kho của ca; (4) `VERIFIED_AT_COUNTER`; (5) chưa liên kết tài khoản; (6) Beneficiary nằm trong phân bổ đã duyệt; (7) có attestation kèm email đã xác nhận; (8) `expectedGeneration` khớp mã hiện tại. Email luôn lấy từ attestation, không nhận email tùy ý trong request. Lặp lại cùng `expectedGeneration` trả lại cùng yêu cầu (idempotent). Kết quả `202` chỉ là đã xếp hàng; transport thật chưa bật. Lời mời không thay Legal, mở khóa hay bàn giao tại quầy.

**Chưa chốt (không tự đặt policy):** gửi lại/đổi email sau khi đã có mã gắn email hiện bị `BENEFICIARY_INVITATION_ALREADY_EXISTS`; đổi email sau khi mã đã gắn email vẫn cần policy riêng.

## 6. Kiểm chứng và giới hạn

Đã có: test dịch vụ (6), controller (5), SQL Server thật (4 test trong `BeneficiaryInvitationSqlServerTest`: thu hồi mã khi liên kết tại quầy, tạo không cần mã, danh sách theo dữ liệu thật, che dữ liệu với Staff khác, ca đã hủy và kho khác) và `StaffCounterInvitationSqlServerTest` (9 test, SQL Server thật: gửi mã chỉ sau attestation và gắn đúng email; retry idempotent và generation cũ; thiếu attestation/email; chưa xác minh hoặc đã liên kết; Staff khác, ca đóng, kho khác; chưa duyệt Legal và ngoài phân bổ; hai yêu cầu đồng thời chỉ một mã/một outbox; bàn giao không cần tài khoản hay lời mời; gửi lại hiện bị từ chối). Tìm hồ sơ: `StaffCaseSearchSqlServerTest`.
Giới hạn: danh sách không phân trang (số Beneficiary của một kho nhỏ); ca chờ nhận (`OPEN`, chưa giao) chỉ xem được qua `GET /api/v1/staff/verification-cases/{caseId}` (PS-93); API Beneficiary ở trên chỉ dùng sau khi Staff đã nhận ca; chưa ghi nhận riêng lựa chọn "xử lý offline".

## Cập nhật 22/10/2026 — xác nhận Staff tại quầy

POST identity-attestations lưu biên bản bất biến và cập nhật VERIFIED_AT_COUNTER trong cùng transaction, sau kiểm tra Staff được giao ca OPEN và đúng người/kho. Đây là nguồn trạng thái tương thích cho guard liên kết/giao tài sản hiện có; FE không gửi MATCH hay trạng thái verified. Không tự cập nhật các biên bản cũ; Staff cần ghi nhận lại thao tác tại quầy qua API. Không thay guard Legal/unlock/phân bổ. Menu Staff Bàn giao tài sản mở /staff/handover; vào màn giao chi tiết từ liên kết của phiên để giữ sessionId.

### Metadata tài sản khi bàn giao — 22/10/2026
GET /staff/verification-cases/{caseId}/assets cho phép Staff được giao ca OPEN đọc assetId/assetType/name trong các trạng thái trước mở khóa hiện có, UNLOCKED và HANDOVER_IN_PROGRESS. Không trả payload, ảnh hoặc bí mật tài sản. Vẫn chặn ACTIVE, ON_HOLD, ARCHIVED và sai assignment. Màn bàn giao ghép metadata theo assetId với eligible-assets; quyền giao vẫn do endpoint giao kiểm tra độc lập.
