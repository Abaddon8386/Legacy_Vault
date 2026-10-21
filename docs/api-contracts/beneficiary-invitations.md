# PS-86 — Mã mời liên kết tài khoản Beneficiary

Policy được người dùng chốt trong chat ngày **20/10/2026**: đồng ý đề xuất PS-86,
**dùng mã mời làm bằng chứng nhận lời mời, chưa thêm xác minh email hoặc OTP**.
Ưu tiên PS-86; PS-80 chờ quyết định. Implementation local từ develop `0e3fc6c`;
chưa push/merge. Nguồn Jira: [PS-86](https://thaithai9785.atlassian.net/browse/PS-86),
[PS-87](https://thaithai9785.atlassian.net/browse/PS-87).

## Policy và giới hạn quyền

- Server sinh 16 byte bằng CSPRNG (128 bit), base64url không padding, **22 ký tự phân
  biệt hoa/thường**. Mã không phải UUID hồ sơ. Hạn đúng 7 ngày UTC từ lúc cấp;
  `now >= expiresAt` là hết hạn. Không gia hạn khi retry.
- DB chỉ lưu SHA-256 của mã entropy cao. GET, audit và `toString` không trả/ghi mã
  thô hoặc hash. Chỉ POST cấp/cấp lại trả mã thô, response `Cache-Control: no-store`.
  Không có API xem lại mã. Owner tự chủ động chia sẻ; hệ thống không tự gửi email/SMS.
- **Possession là bằng chứng lời mời**, không phải xác minh danh tính pháp lý.
  Không yêu cầu hồ sơ có email, không so email tài khoản với email hồ sơ, không
  yêu cầu `emailVerifiedAt`, không thêm OTP/eKYC. Lộ/chuyển tiếp mã có thể cho phép
  tài khoản hợp lệ khác nhận lời mời; Owner cần thu hồi/cấp lại khi mã lộ.
- Chỉ Owner đúng Vault, khi Vault ACTIVE, mới được cấp/cấp lại/thu hồi.
  Kho khác hoặc Beneficiary khác kho/không tồn tại → 404. Role khác → 403; thiếu JWT → 401.
- Mỗi Beneficiary tối đa một generation current. Cấp lại thu hồi generation trước
  và giữ lịch sử. Đổi email Beneficiary tự thu hồi mã chưa dùng trong transaction
  cập nhật; không sửa/hủy liên kết account đã có. Retry cập nhật cùng email không
  tự thu hồi mã.
- Nhận mã chỉ liên kết tài khoản và thêm `ROLE_BENEFICIARY`; giữ role hợp lệ đã có.
  Không thay identity verification, designation, Vault/case/Legal/handover state,
  allocation hay receipt; không tự tạo Vault/entitlement hoặc mở quyền xem bí mật.
- Tài khoản nhận phải ACTIVE, chưa xóa; không phải Owner của chính Vault, không có
  Staff/Legal/Admin, không liên kết Beneficiary khác trong cùng Vault. V26 unique
  `(vault_id,linked_user_id)` vẫn là chốt cuối. Một account được nhận lời mời của
  các Vault khác nhau. Không thay luồng Staff PS-62/63 khi người nhận chưa có mã.
- Internal consume cũng chỉ ACTIVE; sau freeze/Owner qua đời làm việc với Staff
  theo quy trình hiện có. Không ghi vào Vault ARCHIVED. Owner vẫn đọc metadata
  kho mình sau freeze/archive. Không có guest portal hoặc self-confirm delivery.

## API Owner đã triển khai

Tiền tố `/api/v1/vaults/{vaultId}/beneficiaries/{beneficiaryId}/invitation`, Bearer
JWT `ROLE_VAULT_OWNER`. Actor lấy từ principal. Client không quyết định role,
owner/account, code, expiry hoặc state. Các ID công khai là UUID.

- `GET`: 200 metadata hiện tại. Chưa cấp: `state=NOT_ISSUED`, các trường invitation
  còn lại null, vẫn có `beneficiaryId`. Không trả mã/hash.
- `POST`: không cần body, 201 `{invitation: metadata, code: string}`. Chỉ cấp lần
  đầu, nếu đã có generation bất kỳ → 409 `BENEFICIARY_INVITATION_ALREADY_EXISTS`.
- `POST /reissue`: body `{ "generation": 1 }` (số nguyên dương đang hiển thị),
  201 cùng shape POST, generation tăng 1. Đây là kiểm tra chống request cũ:
  generation không còn current → 409 `BENEFICIARY_INVITATION_STALE`, không cấp tiếp
  mã nữa. Chưa có mã → 404. Mã đã dùng/account đã link không được cấp lại.
- `DELETE ?generation=1`: bắt buộc generation số nguyên dương đang hiển thị, 204,
  thu hồi generation chưa dùng. Lặp lại cùng generation sau khi đã thu hồi → 204,
  giữ evidence và không audit trùng. Generation cũ → 409 `BENEFICIARY_INVITATION_STALE`,
  không thu hồi mã mới vừa cấp lại; thiếu/sai generation → 400; chưa có mã → 404. Đã dùng → 409
  `BENEFICIARY_INVITATION_ALREADY_USED`, không hủy account link.

Metadata có `invitationId`, `beneficiaryId`, `state`, `generation`, `issuedAt`,
`expiresAt`, `revokedAt`, `consumedAt`. Thời gian ISO-8601 UTC có `Z`; trạng thái
`NOT_ISSUED`, `PENDING`, `EXPIRED`, `REVOKED`, `CONSUMED`. REVOKED/CONSUMED giữ
trạng thái terminal sau expiry. GET và mọi response thành công đặt `no-store`;
không đặt code trong URL, Location hoặc query. `Issued.toString()` che code.

Ví dụ POST thành công (mã minh họa):

```json
{
  "invitation": {
    "invitationId": "8d8f5f59-8f03-49d7-9d62-88ac5cbaab23",
    "beneficiaryId": "6ae67da3-e594-424b-8d25-d9f39e433bd6",
    "state": "PENDING", "generation": 1,
    "issuedAt": "2026-10-20T04:00:00Z", "expiresAt": "2026-10-27T04:00:00Z",
    "revokedAt": null, "consumedAt": null
  },
  "code": "AAAAAAAAAAAAAAAAAAAAAA"
}
```

Lỗi dùng envelope/i18n VI/EN hiện có. Ngoài các mã trên: 409
`VAULT_NOT_EDITABLE`, `BENEFICIARY_ACCOUNT_ALREADY_LINKED`; 400 validation của
generation; 401/403/404 như quy ước chung. Nhận mã nội bộ dùng chung 422
`BENEFICIARY_INVITATION_INVALID` cho mã sai/không current/hết hạn/thu hồi, account
không hợp lệ hoặc mã đã dùng bởi account khác; không lộ hồ sơ từ mã sai.

## FE recovery: thêm người và cấp mã là hai bước

1. POST tạo Beneficiary PS-20, lưu ID từ response thành công.
2. POST invitation cho ID đó; sau khi thành công hiển thị code/trạng thái cạnh người.
3. Nếu cấp mã lỗi, giữ người đã tạo và retry trên ID đó; không POST lại người.
4. Nếu response cấp mã bị mất: GET metadata. Nếu PENDING, Owner phải chủ động cấp
   lại vì DB không thể phục hồi raw code; không tự rotate sau network retry.
   GET giúp lấy generation mới khi response reissue bị mất hoặc request stale.

POST PS-20 hiện **không** idempotent. Nếu mất chính response tạo Beneficiary, FE
phải đối chiếu danh sách đã lưu trước khi thử tạo lại; PS-86 không tuyên bố giải
quyết exactly-once cho PS-20. Không thêm dữ liệu mock vào runtime. Owner list
`hasAccount` nay phản ánh `linked_user_id` thật.

## Hợp đồng nội bộ để PS-87 tích hợp

`BeneficiaryInvitationService.linkAccount(code, accountId)` dùng propagation
**MANDATORY**, không tự mở transaction riêng, **chưa có route HTTP redeem/signup**.
PS-87 lấy accountId từ principal xác thực hoặc User vừa tạo trong outer transaction,
không nhận accountId/role từ client. Cùng transaction: link Beneficiary, thêm role
nếu chưa có, mark CONSUMED và audit. Lỗi signup/link/role/audit rollback toàn bộ.

Retry cùng mã bởi đúng account đã link và có role Beneficiary trả kết quả cũ, giữ
consumedAt/actor/audit. Account khác không được replay. Thêm role không xóa role
Owner hợp lệ. PS-87 phải tránh reuse đăng ký thường đang mặc định cấp Owner cho
tài khoản mới theo mã; tạo mới theo mã chỉ cấp Beneficiary, phát JWT/`me` phản ánh
role thật và giữ quy tắc hạn phiên hiện có. PS-86 không sửa Google login.

**Trước khi PS-87 mở endpoint công khai**, cần gắn rate limiter dùng chung nhiều
instance: policy đã chọn 5 lần thất bại/account/15 phút; endpoint đăng ký cần limiter
theo nguồn truy cập tin cậy và cấu hình trusted proxy được nhóm thống nhất. Đếm thất
bại phải tồn tại dù business transaction rollback. Chưa có public redeem nên PS-86
không cung cấp limiter giả trong RAM hoặc tuyên bố đã kiểm thử public anti-bruteforce.
Không cho phép gọi service seam trực tiếp từ một endpoint mới mà bỏ limiter.

## Khóa, migration và audit

Owner lifecycle writes khóa Vault rồi refresh Vault/Beneficiary/invitation; không tin entity ACTIVE
cũ trong persistence context. Internal consume khóa **target User → Vault**, refresh
account, kiểm tra role/link rồi ghi. Đây là cùng thứ tự User → Vault của Owner/quota
writers, tránh giữ Vault trong lúc chờ User. User lock tuần tự hóa thêm role của cùng account
khi nhận mã ở các Vault khác nhau. PS-87 không giữ sẵn Vault/resource write lock trước
khi gọi seam; account mới được tạo trong outer transaction, không commit sớm.
Staff liên kết account có sẵn cũng khóa target User → Vault → VerificationCase →
Beneficiary, có preflight ca/identity trước lookup account và recheck sau khóa.
Staff tạo account mới cũng kiểm tra/cấp User trước Vault → Case, sau preflight quyền
ca/identity; recheck dưới resource locks và rollback User mới nếu ca/identity/link
đã thay đổi. Không giữ Vault lock trong lúc chờ email unique index của signup khác.
Staff link thắng thì consume từ
chối, consume thắng thì Staff gặp linked account. Role unique/constraint failure
rollback transaction, không query tiếp transaction Hibernate đã lỗi.

V34 thêm `beneficiary_invitations`: public UUID, internal BIGINT, Beneficiary FK,
generation, hash unique, current filtered unique index, actor/time của cấp/thu hồi/
consume và constraints terminal/expiry. History giữ generation trước; expiration
được tính theo server time, không cần scheduler sửa trạng thái. Không sửa V1–33
hoặc Flyway history. Trigger UPDATE/DELETE cho archive theo numeric SQL error 51300;
INSERT được guard ở service, không tuyên bố raw SQL INSERT bị chặn.

Audit `BENEFICIARY_INVITATION_ISSUED/REISSUED/REVOKED/CONSUMED` cùng transaction.
Chỉ lưu resource/actor/generation/state/time, không code/hash/email/identity. Tất
cả API mới do backend kiểm tra ownership; không đổi quyền đọc của Owner/Staff/Legal.

## Kiểm chứng và tích hợp tiếp theo

Test nguồn: `InvitationTokensTest`, `BeneficiaryInvitationControllerTest`,
`BeneficiaryInvitationSqlServerTest`, `InvitationMigrationUpgradeSqlServerTest`.
Bao phủ AC PS-86: ownership/lifecycle/recovery, hash-only, no-store, expiry boundary,
reissue stale/concurrent, retry/replay, internal account eligibility, email không
bắt buộc, multirole, không early access, audit rollback, atomic outer signup rollback,
SQL filtered unique, fresh Flyway và upgrade V33 → V34 bảo toàn liên kết cũ.

Kết quả thực tế và giới hạn ghi ở `docs/verification/PS-86-local-verification-2026-10-20.md`;
kết quả rà soát/fix tiếp theo ở `docs/verification/PS-86-review-2026-10-20.md`.
Chưa chứng nhận FE PS-89 hoặc public signup/redeem/JWT refresh PS-87. Chưa push/merge
và không đổi Jira status. Không gửi tin đồng đội hoặc cập nhật Jira tự động.
