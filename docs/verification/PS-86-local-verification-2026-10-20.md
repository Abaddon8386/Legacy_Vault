# PS-86 — Local implementation and verification, 20/10/2026

**Báo cáo lịch sử trước review.** API DELETE và thứ tự khóa đã được sửa tiếp theo;
xem [review mới nhất](PS-86-review-2026-10-20.md) và contract PS-86 hiện hành.
Các số test bên dưới chỉ thuộc snapshot trước review, không phải kết quả cuối mới nhất.

Ngày kiểm chứng: 20/10/2026, Asia/Saigon. Nhánh local
`feature/PS-86-beneficiary-invitation`, base develop
`0e3fc6c81f4eae645a18801f01141470b5f61cba`. Chưa commit/push/merge; không đổi
Jira status hoặc gửi tin đồng đội. Hai file CONTEXT-HANDOFF untracked có sẵn
được giữ nguyên, không thuộc implementation này.

## Policy và implementation

Người dùng chốt trong chat: dùng mã mời làm bằng chứng nhận lời mời, chưa thêm
xác minh email/OTP; ưu tiên PS-86, PS-80 chờ quyết định; triển khai/kiểm thử local.
Contract: [beneficiary-invitations.md](../api-contracts/beneficiary-invitations.md).

- Owner issue/get/reissue/revoke đúng Vault và Beneficiary; writes chỉ ACTIVE,
  refresh sau khóa Vault. Reissue kiểm tra generation, giữ lịch sử và vô hiệu mã cũ.
- CSPRNG 128 bit, base64url 22 ký tự, 7 ngày UTC; hash-only SQL, raw code chỉ trả
  một lần, no-store, DTO log che mã. Code không phải UUID tài nguyên.
- Internal `linkAccount` dùng MANDATORY outer transaction: thêm role Beneficiary,
  giữ role hợp lệ, link hồ sơ, consume và audit nguyên tử; không cần email khớp hay
  đã xác minh. Giữ các điều kiện eligibility và không early access.
- V34 là migration mới, không sửa V1–33 hoặc Flyway history. Archive trigger chỉ
  UPDATE/DELETE theo numeric error 51300; raw SQL INSERT không được trigger bảo vệ.
- Owner cập nhật hồ sơ refresh Beneficiary để không ghi đè account link đã commit
  trong lúc chờ khóa. Đổi email thu hồi mã chưa dùng; consumed link giữ nguyên.
  `hasAccount` trong DTO Owner phản ánh linkage thật.
- ErrorCode, messages VI/EN, OpenAPI, decision log và các contract liên quan được
  cập nhật. Không thay API login/register/Google, không sửa FE.

## Kết quả trên snapshot cuối

Regression backend chạy với hai opt-in `LEGAL_SQLSERVER_MASTER_URL` và
`STAFF_SQLSERVER_MASTER_URL`, mỗi fixture tự tạo/drop DB ngẫu nhiên riêng:

```powershell
cd backend
.\mvnw.cmd '-Dtest=*,!LegacyvaultBackendApplicationTests' test
```

- **685 tests: 631 pass, 54 skip, 0 failures, 0 errors; BUILD SUCCESS.**
- **114 SQL-specific tests thực chạy**, không tính các test bị skip hoặc cộng
  lượt chạy lặp. Có legal/handover, Staff contact/identity và migration upgrade.
- Riêng PS-86: **36 test pass riêng biệt**: 3 token/state tests, 4 MVC contract
  tests, 28 Spring/JPA/API SQL Server tests và 1 V33 → V34 upgrade test.
- `contextLoads` chạy riêng bằng `-Dtest=LegacyvaultBackendApplicationTests`,
  với DB `LegacyVault_PS86_Context_<random32hex>`, khóa fixture và datasource
  override trong process: **1 pass, 0 skip/failure/error; BUILD SUCCESS**.
- Tổng hai lượt không trùng test: **632 pass, 54 skip, 0 failure/error**. Không
  cộng các lần thử trước hoặc lần chạy lại contract vào tổng này.

54 skip thuộc `SubscriptionSqlServerTest` (23), `LifetimeImagesSqlServerTest`
(28, gồm inherited cases) và `DmsSqlServerConcurrencyTest` (3), chưa bật opt-in
riêng. Không tuyên bố chúng đã chạy hoặc toàn bộ SQL của hệ thống đã được chứng nhận.
Context test ban đầu được loại khỏi regression để tránh datasource ứng dụng mặc
định, rồi đã chạy lại riêng trên DB tạm an toàn như trên.

Raw local logs (ignored build artifacts): `backend/target/ps86-regression-final.log`,
`backend/target/ps86-context.log`; JUnit XML ở `backend/target/surefire-reports`.
Java 25.0.4, Spring Boot 4.1.1, SQL Server 17.0 trên localhost.

## Nội dung được kiểm chứng

- Cấp mã không cần email; expiry chính xác tại boundary; code canonical và hash
  ổn định; không raw code/hash trong GET/audit/DTO toString/schema plaintext.
- Owner khác kho/Beneficiary khác kho/không tồn tại bị từ chối; anonymous/sai role
  401/403. API qua JWT thật + SQL persistence; DB authorities chặn role claim injection.
- Lần cấp trùng không rotate; cấp lại vô hiệu code cũ, stale generation bị chặn;
  hai initial issue hoặc reissue đồng thời chỉ một lần thành công.
- Thu hồi idempotent, expired/revoked không redeem; retry consumed bởi đúng
  account giữ consumedAt/audit/role; replay bởi account khác không thành công.
- Internal/disabled/deleted account, Owner cùng kho, duplicate linkage cùng kho
  bị từ chối; multirole và nhận mã hai Vault đồng thời không thêm role trùng.
- Revoke và consume cạnh tranh chỉ một terminal state; Staff service link thật
  và consume cạnh tranh không ghi đè account của nhau. Owner update giữ link đã
  commit dù persistence context đang giữ Beneficiary cũ.
- Audit failure rollback issue, reissue, revoke, consume; rollback outer signup
  xóa cả User mới/role/link/consume. Gọi seam ngoài transaction bị từ chối.
- Freeze/archive block service writes/consume; Owner vẫn đọc metadata; SQL unique
  current và archive UPDATE/DELETE guard thực thi. Không tự xác minh identity,
  mở Vault, tạo allocation hoặc cấp entitlement.
- Fresh Flyway có 35 migration files (gồm V5.1), nâng V33 → V34 áp đúng 1 migration,
  giữ account link/identity đã có, validate và migrate lại áp 0 migration.
  Handover upgrade regression V27 → V34 áp 7 migration và giữ dữ liệu cũ.
- OpenAPI parse không duplicate key, mọi local `$ref` resolve và enum lỗi khớp
  toàn bộ ErrorCode runtime qua `SubscriptionContractTest`.

## Cleanup và giới hạn tích hợp

Sau regression và context test, truy vấn `sys.databases` cho các prefix fixture
LegalTest, StaffPatch, HandoverUpgrade, InvitationUpgrade, V30Trigger và
PS86_Context trả **0 DB còn lại**. Không reset, repair hoặc migrate DB ứng dụng.

PS-87 vẫn phải tích hợp public signup/redeem, accountId từ principal, JWT/me và
limiter dùng chung (5 lỗi/account/15 phút; signup theo nguồn truy cập tin cậy).
PS-86 cung cấp seam transaction và API Owner, **không mở route redeem công khai**;
không tuyên bố anti-bruteforce public signup đã được triển khai/kiểm thử. Không
tự gán Owner cho tài khoản mới qua mã khi PS-87 tích hợp.

Chưa có browser/FE E2E PS-89 hoặc public auth invitation E2E PS-87. Không chứng
nhận schema history đã bị sửa/checksum khác trên DB hiện hữu. Việc push/merge
chưa được thực hiện theo yêu cầu người dùng.
