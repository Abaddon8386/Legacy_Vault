# PS-5 — Bản commit/push riêng

Repo https://github.com/Abaddon8386/Legacy_Vault. Ngày 13/10/2026.
Nhánh feature/PS-5-assets-api-integration, develop base f04b4b639aff4be43234079b6107f576e7cf0c2d.
Checkout C:/Users/hai/.codex/worktrees/ps5-push/Legacy_Vault.
Người dùng đã review và yêu cầu commit/push PS-5 trước; chưa yêu cầu merge.

## Lịch sử và phạm vi

- Nền chung API/session FE PS-1–4 cần cho PS-5: commit c93ab0d. Nền gốc PS-4 đã merge không được đưa lại lần nữa.
- Commit gốc PS-5 của Huy 6bd94fd2a85fae37ce67ea8c3dbe56615ee11b21 được giữ nguyên, đưa vào nhánh bằng merge commit 9be0cc5; không sửa tác giả/email/ngày. PR gốc #11 chưa thay đổi.
- Sửa bổ sung PS-5: nối route/menu Assets vào session/Vault chung, Bearer/locale/abort; whitelist metadata và body; page/UUID/receipt guards; payload chỉ ghi; VI/EN fallback; clear form và logout/403/404.
- Phần component/i18n/test đã review từ bản PS-5 local a83fbdc trong cùng repo, cùng các sửa integration; không copy code từ repo cũ/backup.
- Không có PS-6 detail/edit, PS-7 wills, PS-8 Trustee/Beneficiary hoặc sửa BE/DB trong nhánh này. DMS/auth/Vault thay đổi thuộc nền phụ thuộc chung.

## Kiểm tra

Jira PS-5 đọc trực tiếp trong lượt commit. Contract PS-74 đã chốt 80ae8b8a94b3deff65ad3f54f1f05d79194f3e3f.
Nền trước PS-5: 85/85 Node tests PASS. Bản cuối PS-5: 113/113 Node tests PASS; lint/build PASS; diff whitespace check PASS.
Bản PS-5 này có cùng frontend logic đã review/test bằng fixture ở lượt trước. Không chạy lại mọi tổ hợp browser trong lượt commit, không tuyên bố đã test BE thật.
Hai file JSX Vitest cũ không có runner/dependency phù hợp được thay bằng các contract/native Node tests; test mới không được coi là thay thế mọi kiểm thử render UI. UI fixture add/list/validation/VI/EN/401/reset payload đã có bằng chứng trước đó.
Fixture loopback 18175 chỉ dùng kiểm thử FE, không SQL Server và không backend nghiệp vụ. API mặc định /api/v1 proxy localhost:8080 nếu bỏ API_PROXY_TARGET.

## Review

PR khi tạo sẽ có cả prerequisite c93ab0d và phần PS-5, vì lớp API/session chung chưa merge riêng vào develop. Các commit được tách để review; không merge đồng thời các PR khác có cùng nền này mà không cập nhật base.
Các commit sửa bổ sung dùng email Git hiệu lực bevatysun12@gmail.com. Commit gốc Huy không đổi.
Không commit .agents, ảnh evidence local, .env thật, token thật hoặc mật khẩu DB. Không sửa develop/main hay Jira.
