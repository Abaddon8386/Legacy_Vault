# PS-99 / PS-100 / PS-101 — FE Legal, phần độc lập trước PS-102

## Phạm vi và trạng thái

Đọc trực tiếp Jira ngày 20/10/2026: ba task chưa Done giao Le Gia Huy là PS-99, PS-100, PS-101. PS-102 giao Ân Ngô vẫn To Do. PS-96/97 không thuộc danh sách đang giao Huy trong lượt này.

Nền `origin/develop` đã pull tại `7b06ede`. Một nhánh feature/PR chung cho chuỗi Legal dùng chung case context, không thay BE, DB, auth role, dependency hoặc ticket Done. PR này **chỉ bàn giao phần độc lập đã làm được**, không tuyên bố hoàn tất AC/DoD ba task. Không đổi Jira hoặc tự merge.

## Đã thực hiện

- Adapter HTTP bám controller/DTO hiện có: death document GET/decision; will overview/comparison; basis dossier GET/classification/reclassification; review/supplementation; court GET/decision; hold; final decision và unlock. HTTP status 200/201, chỉ whitelist trường DTO; actor/time/hash từ receipt server, không dùng synthetic approval receipt làm contract thật.
- Form live cho xác minh tử vong, đối chiếu, phân loại, review/bổ sung, COURT và ON_HOLD. Giấy tờ/bản gốc/phiên bản chọn từ dữ liệu đọc, không nhập UUID tay, không gọi queue Staff hoặc Owner API. Đọc lại trước mutation; dossier/version/allocations thay đổi thì chặn và yêu cầu tải lại.
- App nhận session Legal thật, giữ caseId trong điều hướng URL giữa các bước và sau reload (chỉ chọn lại nếu danh sách được phép trả case đó). Scope component theo tài khoản/token/case/bước; hủy cả đọc và ghi khi rời scope; bỏ phản hồi muộn, chống gửi trùng khi pending; lỗi giữ bản nhập, đổi VI/EN giữ bản nhập.
- 401 yêu cầu xác thực lại; 403/404/409 khóa thao tác chờ reload. Network/receipt lỗi không coi là thành công và không tự POST retry.
- Phê duyệt cuối/unlock giữ unavailable khi thiếu read freshness/capability/current approval. Adapter mutation đã có kiểm thử riêng nhưng **chưa nối nút live**: không đoán GET snapshot/unlock hoặc tự mở nút chỉ vì có POST.
- Phiên thật không fallback mock. Trang preview không đăng nhập đã có giữ nguyên. Không thêm dữ liệu demo runtime.

## Blocker PS-102 cần BE cung cấp

Không có endpoint/contract Legal queue hoặc read context tổng thể trong develop đã đọc. Các GET theo ID hiện có không thay thế việc khám phá case. Jira PS-102 cũng xác nhận thiếu phần này.

1. Contract danh sách có phân trang/filter, phạm vi truy cập Legal; case/vault, giấy tờ khai tử được phép xem và reference/label đủ để chọn hồ sơ. Không dùng case/UUID của Staff để vượt qua discovery.
2. Read snapshot cho dossier hiện tại, case/vault state, version/hash/allocation/dispute, hold/re-review/freshness, kết luận COURT và latest approval/capability unlock. Không suy trạng thái từ DMS hoặc receipt của bước trước.
3. Nguồn đọc nội dung file Legal chưa có: will overview chỉ có metadata/hash; không dựng nút tải file giả.

`legalDiscovery` của App là một **điểm nối callback nội bộ**, không phải HTTP contract hoặc endpoint đề xuất. Kết quả UI tối thiểu được dùng trong test là `[{caseId, label, deathDocumentIds}]`. Không có adapter mặc định, không fetch URL suy đoán, không gọi callback fixture trong ứng dụng. Khi PS-102 có contract, vẫn cần triển khai adapter HTTP đúng quyền/phân trang và kiểm thử lại; không nói rằng BE nối vào sẽ tự chạy mà không cần sửa FE.

Vì chưa có callback production, phiên Legal hiện hiển thị danh sách chưa khả dụng; các form theo case chưa truy cập được từ UI thực tế. Đây là giới hạn triển khai còn lại, không phải danh sách thật rỗng hoặc task hoàn tất. Các hàm approval/unlock cũng chưa trở thành chức năng người dùng chạy được. Các stub live BACKEND_NOT_READY cũ còn phục vụ trang cũ/preview; nhánh live mới không gọi chúng.

## Đối chiếu contract

Đọc `LegalDeathVerificationController`, `LegalWillComparisonController`, `LegalBasisDossierController`, `CourtDecisionController`, `LegalBasisHoldController`, `LegalVaultUnlockController` và DTO tương ứng; tài liệu legal-death-verification, legal-will-comparison, legal-basis-dossier, court-route, legal-workflow-hold, legal-vault-unlock.

ApprovalRequest thực: `{decision, versionNo, sha256Hash, allocationHash, reason}`; rejection phải có reason, approve có thể không. ApprovalResponse dùng `LEGAL_APPROVED/LEGAL_REJECTED`, dossierId và snapshot, actor/time. Unlock POST không có body snapshot/role, chỉ nhận receipt có caseId/vaultId/status UNLOCKED/actor/time. Review/approval dùng LocalDateTime trong DTO nên validator không tự ép hậu tố Z; death/will/court/unlock dùng Instant UTC.

## Kiểm chứng và giới hạn

- 39 test adapter mới: mọi mutation URL/method/payload/status; role guard; malformed/mismatched receipts; stale version/hash/allocation; reason/enum boundaries; 401/403/404/409; GET chỉ thuộc Legal.
- 17 test component mới JSDOM + Vite: unavailable/empty/error, role/session guard, duplicate pending, draft VI/EN, một quyết định mỗi death document, case switch/unmount abort, 409 giữ draft, chọn version/hash đúng overview, context navigation, các nhánh classification/review/court/hold, stale dossier và khóa approval/unlock thiếu read.
- 81 test hồi quy liên quan đã đạt sau tích hợp. Test AppShell đếm thêm một vị trí render nhưng vẫn kiểm tra đầy đủ session/auth/logout ở mọi vị trí. Giữ kiểm tra route/auth/preview của PS-49.
- Toàn bộ frontend: **863/863 test đạt**, 33 suites, không fail/skip. Lint/build đạt; build còn cảnh báo bundle trên 500 kB hiện có. Sau khi giữ refresh của AppShell, chạy lại test App/auth/approval liên quan; kết quả ghi trong PR.
- Mọi fixture/callback giả chỉ trong test, không chứng minh E2E SQL Server.
- Probe read-only BE `localhost:8080` bị connection refused. Không khởi động migration/seed hoặc tạo dữ liệu/tài khoản để vượt blocker. Chưa có bằng chứng browser desktop/mobile với BE thật, quyết định thật, file thật, SQL receipts hoặc E2E hoàn tất; không coi các mục này đạt bằng JSDOM.

UI giữ token/component shell hiện có, Forest Green/Sand Gold, card, typography, focus/44px target; CSS scope `.lv-legal-live`, responsive dưới 600px và thông báo lưu ý cận đỏ. Đã đọc notes.md và xem ảnh tham khảo gradient trong thư mục UI bên ngoài: ghi chú yêu cầu giữ nghiệp vụ, VI/EN/mobile; ảnh gradient chỉ tham khảo, không thay palette. Không chép bộ tài liệu tham khảo vào Git.

## Cần làm tiếp khi PS-102 sẵn sàng

Nối discovery/read context thật; bật các thao tác dựa trên capability và snapshot được duyệt; bổ sung luồng approval/unlock/Staff continuation đúng role; chạy browser/BE/SQL trên dữ liệu được phép, gồm quyền, version cũ, hold, COURT, response muộn, concurrency và receipts. PS-99/100/101 vẫn chưa đủ DoD tới khi hoàn thành các bước này.

## Sửa lỗi review PR #155: tải lại danh sách thất bại vẫn giữ quyền cũ

- Lỗi được sửa: queue đã tải thành công còn lưu sau khi discovery đổi/session thay đổi và lần tải mới trả 403. Form cũ vẫn xuất hiện và nút mutation còn bật.
- Kết quả discovery giờ gắn với đúng session, callback và lượt retry. Render chỉ dùng queue khi kết quả thuộc lượt hiện hành và thành công. Khi bắt đầu kiểm tra quyền mới, form cũ unmount ngay, request đọc/ghi bị abort, metadata/draft/receipt cũ bị dọn; khi 403 hoặc bất kỳ lỗi/response sai thì không khôi phục queue cũ.
- Retry cũng giữ khóa cho tới khi discovery thành công. Sau thành công cần chọn lại giấy tờ/nạp dữ liệu, không phục hồi quyết định đang nhập từ lần quyền chưa xác minh.
- 7 test hồi quy mới: pending→403/404/500/network/invalid response; retry; đổi token khi mutation pending rồi 403/receipt muộn; gỡ discovery đang có hồ sơ. Bộ component 24/24; toàn FE **870/870 đạt**, 33 suites; lint/build/diff check đạt. Không thay contract/BE hoặc mở thêm thao tác ngoài phạm vi lỗi.
- Đã kiểm tra browser **harness fixture riêng ngoài repo** import component thật, không tạo session tài khoản hay dữ liệu DB: form sẵn sàng → tải lại quyền (form=0) → 403 (form=0, nút submit=0, select disabled). Desktop VI và mobile EN 390×844; mobile body scrollWidth 359 < viewport 390, không tràn ngang. Có nhãn fixture rõ ràng trong mọi ảnh; không gửi POST trong harness.
- Ảnh: [đang xác minh lại](../screenshots/ps155-revalidating.png), [403 desktop](../screenshots/ps155-denied.png), [403 mobile EN](../screenshots/ps155-denied-mobile-en.png).
- Đây là bằng chứng UI hồi quy bằng fixture, không thay thế browser/BE/SQL E2E còn chờ PS-102. Harness không được thêm vào ứng dụng hoặc commit.
