# Tài khoản Beneficiary tại quầy — PS-62, PS-63 (ST-24, LV-ID-001)

**Mở rộng 20/10/2026:** [PS-86](beneficiary-invitations.md) thêm mã mời do Owner cấp
để onboarding trước khi tới quầy. Sở hữu mã là bằng chứng nhận lời mời, không thay
identity verification hoặc quyền bàn giao. API quầy bên dưới giữ điều kiện cũ;
PS-87 tích hợp auth riêng, không tự reuse luồng Staff cho self-service. Cả hai đường
ghi đều khóa Vault và recheck `linked_user_id`, không ghi đè liên kết đã có.

**Trạng thái:** đã triển khai. Các quyết định thiết kế ghi ở [D-API-37](open-decisions.md); đó là cách đọc Main Flow v4.2 và chờ nhóm xác nhận.

## 1. Mô hình

ST-24: sau khi Beneficiary có mặt và được Staff đối chiếu trực tiếp (ST-14, `VERIFIED_AT_COUNTER`), Staff hướng dẫn tạo tài khoản chính thức
và liên kết với đúng bản ghi Beneficiary của kho. Kết quả: `beneficiaries.linked_user_id` được đặt và
`beneficiaries.account_status = 'ACCOUNT_CREATED'`.

- Hồ sơ Beneficiary **độc lập** với tài khoản; liên kết không đổi dữ liệu nhân thân đã lưu.
- **Không** có Guest Retrieval Portal, Claim Link, OTP email hay eKYC. Danh tính đã được đối chiếu tại quầy ở bước ST-14.
- Tài khoản liên kết nhận `ROLE_BENEFICIARY` (nếu chưa có); các vai trò khác của tài khoản (ví dụ Owner của kho khác) được giữ nguyên.
- Beneficiary chỉ truy cập đúng phạm vi tài sản Legal đã duyệt; việc cấp tài khoản **không** cấp quyền giải mã hay nhận tài sản.

## 2. Endpoint

Mọi ID là UUID công khai. Chỉ `STAFF_EXECUTOR`; Owner, Legal, Admin, Beneficiary nhận `403`; chưa đăng nhập nhận `401`.

| Method | Đường dẫn | Mô tả |
|---|---|---|
| `POST` | `/api/v1/staff/beneficiaries/{beneficiaryId}/account-link` | PS-62: liên kết tài khoản có sẵn theo email đăng nhập. `200` |
| `POST` | `/api/v1/staff/beneficiaries/{beneficiaryId}/account` | PS-63: tạo và kích hoạt tài khoản mới, rồi liên kết. `201` + `Location` |

### 2.1 Request

`account-link`:
```json
{ "accountEmail": "beneficiary@example.com" }
```

`account` (mật khẩu do Beneficiary tự chọn tại quầy; 8–72 ký tự, giống đăng ký; không bao giờ lưu hoặc log dạng rõ):
```json
{ "email": "beneficiary@example.com", "password": "********", "phone": "0912345678" }
```
Họ tên của tài khoản mới lấy từ hồ sơ Beneficiary.

### 2.2 Response

```json
{ "beneficiaryId": "uuid", "accountId": "uuid", "accountStatus": "ACCOUNT_CREATED", "identityVerificationStatus": "VERIFIED_AT_COUNTER" }
```
Không trả email, mật khẩu hay khóa nội bộ.

## 3. Điều kiện và lỗi

Staff chỉ thao tác khi đã nhận một ca `OPEN` của **đúng kho** chứa Beneficiary. Ca khác, ca chưa nhận, đã hủy hoặc Beneficiary không tồn tại đều trả `404 RESOURCE_NOT_FOUND`.

| Tình huống | HTTP | Mã lỗi |
|---|---|---|
| Body sai (email không hợp lệ, mật khẩu ngoài 8–72 ký tự, số điện thoại sai) | 400 | `VALIDATION_FAILED` |
| Không có Beneficiary / ca không thuộc Staff / email liên kết không tồn tại | 404 | `RESOURCE_NOT_FOUND` |
| Beneficiary chưa `VERIFIED_AT_COUNTER` | 409 | `BENEFICIARY_IDENTITY_NOT_VERIFIED` |
| Hồ sơ Beneficiary đã có tài khoản | 409 | `BENEFICIARY_ACCOUNT_ALREADY_LINKED` |
| Tài khoản không đủ điều kiện (không `ACTIVE`/đã xóa, là Owner của kho, có quyền Staff/Legal/Admin, đã liên kết Beneficiary khác của cùng kho) | 409 | `BENEFICIARY_ACCOUNT_INELIGIBLE` |
| Email đã có tài khoản (khi tạo mới; dùng `account-link` thay thế) | 409 | `EMAIL_ALREADY_EXISTS` |

## 4. Audit, khóa và dữ liệu

- `BENEFICIARY_ACCOUNT_LINKED` (PS-62) hoặc `BENEFICIARY_ACCOUNT_CREATED` (PS-63), Step `ST-24`, Rule `LV-ID-001`; ghi ID công khai của Beneficiary và tài khoản, trạng thái trước/sau (`NOT_CREATED` → `ACCOUNT_CREATED`). **Không** ghi email, mật khẩu, số điện thoại hay số giấy tờ.
- Liên kết account có sẵn: preflight ca/identity, sau đó khóa target User → Vault → ca →
  Beneficiary (đọc lại sau khóa); cùng User lock với PS-86 để tuần tự hóa cấp role.
  Tạo account mới cũng preflight ca/identity trước, rồi kiểm tra/cấp User trước Vault →
  ca → Beneficiary để không giữ Vault trong lúc chờ email unique index của signup khác.
  Mọi điều kiện được recheck sau khóa; lỗi sau khi cấp User rollback cả User mới.
  Tạo tài khoản, cấp vai trò, liên kết và audit cùng một giao dịch.
- Migration `V26__beneficiary_account_link_uniqueness.sql`: chỉ mục duy nhất `(vault_id, linked_user_id)` khi đã liên kết (cùng tài khoản vẫn có thể là Beneficiary của kho khác) và ràng buộc giá trị `account_status`. Migration dừng với lỗi nếu dữ liệu hiện có vi phạm, không sửa hay xóa dòng nào.

## 5. Kiểm chứng và giới hạn

Đã có: test dịch vụ (11) và test controller (6); cả bộ test Maven chỉ `contextLoads` lỗi (cần SQL Server). Migration `V26` chưa chạy thử trên SQL Server thật.
Giới hạn: chưa có API hủy hay đổi liên kết; chưa có API để Staff tìm danh sách Beneficiary trong ca; Beneficiary đăng nhập bằng luồng đăng nhập chung và chỉ thấy phần thuộc phạm vi được duyệt khi các bước bàn giao (PS-64..) hoàn tất.
