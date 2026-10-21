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
  "invitation": { "state": "PENDING", "expiresAt": "2026-10-27T08:00:00Z" },
  "counterStep": "AWAITING_ACCOUNT_DECISION",
  "actions": { "canLinkAccount": true, "canCreateAccount": true, "canHandOverWithoutAccount": true }
}
```

| Trường | Giá trị |
|---|---|
| `invitation.state` | `NOT_ISSUED` (Owner chưa phát mã), `PENDING`, `EXPIRED`, `REVOKED`, `CONSUMED` |
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

## 5. Kiểm chứng và giới hạn

Đã có: test dịch vụ (6), controller (5), SQL Server thật (4 test mới trong `BeneficiaryInvitationSqlServerTest`: thu hồi mã khi liên kết tại quầy, tạo không cần mã, danh sách theo dữ liệu thật, che dữ liệu với Staff khác, ca đã hủy và kho khác).
Giới hạn: danh sách không phân trang (số Beneficiary của một kho nhỏ); ca chờ nhận (`OPEN`, chưa giao) chỉ xem được qua `GET /api/v1/staff/verification-cases/{caseId}` (PS-93); API Beneficiary ở trên chỉ dùng sau khi Staff đã nhận ca; chưa ghi nhận riêng lựa chọn "xử lý offline".
