# API Contracts — LegacyVault (Sprint 1, PS-9 → PS-23)

> **Trạng thái:** contract Sprint 1 đã chốt. Nền PS-74 và Backend cho PS-19–PS-23 có trong workspace hiện tại; các endpoint khác vẫn theo trạng thái trong `openapi.yaml`.
> Các quyết định nằm trong [open-decisions.md](open-decisions.md); mục thuộc người khác quyết vẫn để mở ở đó.
> Nguồn nghiệp vụ: `00_Main_Flow_FINAL.md` (v4.2), `08_Decision_Unified_Trustee.md`, `09_Decision_Legal_Basis_Branches.md`.

Contract là thỏa thuận giữa FE và BE: gọi vào đâu, gửi gì, nhận gì, lỗi gì. **Mọi PR làm thay đổi API công khai
phải cập nhật thư mục này và [openapi.yaml](openapi.yaml) trong cùng PR.**

## Mục lục

| File | Nội dung | Ticket |
|---|---|---|
| [conventions.md](conventions.md) | Quy ước chung: URL, JSON, DTO, validation, phân trang, i18n, bảo mật | tất cả |
| [error-contract.md](error-contract.md) | Hình dạng lỗi chung, bảng mã lỗi, 401/403 | tất cả |
| [open-decisions.md](open-decisions.md) | Nhật ký quyết định + mục còn mở | tất cả |
| [dev-integration.md](dev-integration.md) | URL/port local, Vite proxy/CORS, chạy FE↔BE↔SQL Server, evidence | PS-74 |
| [system.md](system.md) | `ping`, `db-check` (smoke test) | PS-74 |
| [auth.md](auth.md) | Đăng ký, đăng nhập, RBAC | PS-9, PS-10, PS-11 |
| [auth-role-compatibility.md](auth-role-compatibility.md) | Độ lệch tạm thời: BE trả `roles` có tiền tố `ROLE_`, FE chấp nhận cả hai dạng | PS-1, PS-9, PS-10 |
| [vaults.md](vaults.md) | Tạo/xem Vault, ownership | PS-12, PS-14 |
| [assets.md](assets.md) | Tạo/liệt kê/xem/cập nhật tài sản | PS-15, PS-16 |
| [wills.md](wills.md) | Upload bản số hóa di chúc, SHA-256, version | PS-17, PS-18 |
| [trustees.md](trustees.md) | Trustee (tùy chọn) | PS-19 |
| [beneficiaries.md](beneficiaries.md) | Beneficiary + kiểm tra điều kiện cấu hình | PS-20, PS-21 |
| [beneficiary-invitations.md](beneficiary-invitations.md) | Vòng đời mã mời Owner và seam transaction cho BE auth; policy 20/10 | PS-86, PS-87, PS-89 |
| [dms.md](dms.md) | Cấu hình/check-in DMS, scheduler TRIGGERED + Grace | PS-22, PS-23 |
| [staff-verification.md](staff-verification.md) | Ca xác minh của Staff: hàng đợi, nhận ca, ghi nhận giấy tờ khai tử và di chúc gốc | PS-34, PS-35, PS-38, PS-39 |
| [handover-sessions.md](handover-sessions.md) | Staff mở, xem và đóng handover session cho Vault đã mở khóa | PS-60 |
| [handover-receipts.md](handover-receipts.md) | Staff xác nhận bàn giao và truy xuất receipt bất biến | PS-61 |
| [handover-deliveries.md](handover-deliveries.md) | Phạm vi tài sản được bàn giao, guard bàn giao và ghi nhận từng lần giao | PS-64, PS-65, PS-66 |
| [beneficiary-accounts.md](beneficiary-accounts.md) | Staff liên kết hoặc tạo tài khoản Beneficiary tại quầy | PS-62, PS-63 |
| [counter-beneficiaries.md](counter-beneficiaries.md) | Staff xem Beneficiary của ca, bước tại quầy và trạng thái mã mời/tài khoản | PS-88 |
| [intake-attachments.md](intake-attachments.md) | Staff đính kèm file/ảnh vào giấy tờ tử vong và di chúc giấy gốc; Staff/Legal đọc file và file căn cứ theo quyền | PS-103 |
| [asset-documents.md](asset-documents.md) | Owner đính kèm và đọc tài liệu PDF/Word của tài sản (mã hóa, theo quyền, tính vào dung lượng) | PS-114 |
| [received-assets.md](received-assets.md) | Tài khoản Beneficiary xem lại tài sản đã được Staff giao (danh sách, chi tiết, nội dung, ảnh), kể cả sau lưu trữ | PS-104 |
| [legal-death-verification.md](legal-death-verification.md) | Legal thẩm định giấy tờ khai tử (ST-12), xem chi tiết | PS-36 |
| [legal-will-comparison.md](legal-will-comparison.md) | Legal đối chiếu di chúc giấy gốc với bản scan (ST-15), cổng chặn duyệt | PS-40 |
| [legal-basis-dossier.md](legal-basis-dossier.md) | Hồ sơ căn cứ phân chia: Legal phân loại nhánh, Staff tiếp nhận và chuyển văn bản | PS-41, PS-42, PS-43 |
| [legal-vault-unlock.md](legal-vault-unlock.md) | Legal mở khóa Vault sau khi xác minh approval hiện hành | PS-59 |
| [audit.md](audit.md) | Audit log append-only (nội bộ) | PS-13 |
| [subscriptions.md](subscriptions.md) | PS-77 prototype chờ duyệt; self-grant bị chặn, quota mặc định tắt, một Vault/Owner | PS-77 |
| [openapi.yaml](openapi.yaml) | Bản máy đọc được của toàn bộ contract | tất cả |
| [admin-user-management.md](admin-user-management.md) | Tra cứu tài khoản Admin PS-109; policy khóa/mở khóa còn chờ xác nhận | PS-109 |

## Cách đọc một endpoint

Mỗi endpoint ghi: **quyền** (ai gọi được) · **ownership** (dữ liệu của ai) · **request** (trường, kiểu, validation) ·
**response** · **lỗi** (HTTP + `code`) · **audit** · **ghi chú nghiệp vụ**. Ví dụ dùng dữ liệu giả
(`user@example.com`, token ghi `<jwt>`), không chứa dữ liệu thật.

## Ràng buộc nghiệp vụ áp dụng cho mọi endpoint

- Phân quyền do **backend** quyết định (Spring Security principal/authorities). Guard ở FE chỉ để UX.
- Chủ sở hữu (`owner`) luôn lấy từ người đăng nhập; **không** nhận `ownerId` từ client.
- Response/lỗi không chứa stack trace, SQL, tên schema, secret, mật khẩu, token (ngoài chỗ cấp token), plaintext tài sản.
- DB là SQL Server nhưng contract **không phụ thuộc** chi tiết SQL (tên bảng/cột, kiểu dữ liệu riêng của DB).
- Không có endpoint cho chức năng đã bãi bỏ: Guest Portal (`/api/v1/guest/*`), Claim Link, OTP email, eKYC online,
  `SCOPE_RETRIEVAL` (xem `.claude/rules/obsolete-scope.md`).
- Sprint 1 **không** có API mở khóa/bàn giao, và không có giải mã cho ai khác ngoài **chính Owner** xem lại dữ liệu của mình
  sau khi nhập lại mật khẩu khi kho còn `ACTIVE` (D-API-32/33). DMS hết hạn **không** đồng nghĩa tử vong (LV-DEATH-001).

## Quy trình thay đổi contract

1. Sửa file `.md` tương ứng **và** `openapi.yaml`.
2. Nếu thêm mã lỗi: thêm vào `ErrorCode.java`, `messages.properties`, `messages_en.properties`, `error-contract.md`.
3. Nếu đổi hành vi đã chốt: ghi vào `open-decisions.md` (ai quyết, ngày) và báo FE.
4. Có test bám contract (success/validation/401/403 khi áp dụng).

- [PS-113 Guardian contract](beneficiary-guardians.md) — Owner-only contact history; [OpenAPI](guardian.openapi.yaml).
- [PS-115 Admin VNPay lookup](admin-payment-transactions.md) — real read-only SQL source; [OpenAPI](admin-payments.openapi.yaml), synthetic fixture in fixtures/admin-payments.json.
