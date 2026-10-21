# Chuẩn bị PR FE feedback của Thái — 20/10/2026

## Phạm vi
Bug 1, 2 (phần FE), 3, 8, 9, 12, 16, 17 trong sheet SWP BUG.

- Phân biệt lưu ý/cảnh báo, làm nổi bật nút check-in DMS.
- Chu kỳ DMS giới hạn form 1–180 ngày; đồng bộ đúng khi StrictMode replay, refresh/retry, đổi ngôn ngữ và owner; bỏ response cũ.
- Người thụ hưởng đứng trước; tabs riêng và dialog thêm người, điều hướng bàn phím/focus, thuật ngữ Người thi hành bên ngoài.
- Nhãn dữ liệu minh họa VI/EN trên trang và dialog. DEV preview không ghi DB; đã đăng nhập/production dùng API thật, không fallback fixture.
- Đồng nhất Danh mục tài sản/Heritage Assets; bỏ dropdown số dòng, giữ phân trang 10 dòng theo query khởi tạo hiện có.

## Tích hợp develop
- Remote: https://github.com/Abaddon8386/Legacy_Vault
- Worktree: C:/Users/hai/Downloads/FALL26/SWP/LV-thai-feedback
- Branch: codex/fix-thai-feedback-ui
- Develop đã fetch: 0e3fc6c (gồm PR 135–139 của Huy).
- Commit FE c02ff88; merge develop de2a98e.
- Giải quyết xung đột TrusteeBeneficiaryPage.jsx và CSS: giữ tabs/preview cùng Edit và blur validation của Huy. Giữ cả Google Login, form credential, inline will preview và profile UI từ develop.
- Edit chỉ hiển thị trên dữ liệu API thật; không mở API Edit cho record fixture.
- Báo cáo ngày 19/10 là bằng chứng trước tích hợp. Các tuyên bố chưa commit và số 688 tests trong báo cáo cũ là lịch sử; trạng thái hiện tại và kết quả mới dùng tài liệu này.

## Kiểm chứng sau tích hợp
- npm.cmd test: 720 tests, 33 suites, 720 pass, 0 fail/skip; exit 0.
- node --test src/utils/relatedPersonEdit.test.mjs src/utils/ownerPeopleUi.test.mjs src/utils/trusteeBeneficiaryPreviewGuard.test.mjs: 16 pass, 0 fail/skip.
- npm.cmd run lint: exit 0.
- npm.cmd run build: exit 0; cảnh báo chunk >500 kB vẫn còn.
- git diff --check: exit 0.
- Bằng chứng browser của Anti và review ảnh trước tích hợp được ghi trong báo cáo 19/10. Sau giải quyết merge đã kiểm tra component/JSDOM và build, chưa chạy browser E2E/SQL thật lại.

## Giới hạn
- Demo DMS giờ/phút chờ BE của An; không coi bug 2 hoàn tất end-to-end.
- Không thêm contract/API hoặc migration, không cập nhật Jira/sheet.
- PR 140–142 chưa nằm trong develop này và không được đưa vào nhánh.
- Chỉ chuẩn bị PR nháp; người dùng review/approve/merge theo rule của repo.
