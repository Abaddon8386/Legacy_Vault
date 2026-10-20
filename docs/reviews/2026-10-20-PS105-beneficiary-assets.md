# PS-105 — FE tài sản đã nhận (chuẩn bị song song với BE PS-104)

## Bản nền và yêu cầu

Repo Abaddon8386/Legacy_Vault, base develop 7b06ede (đã merge PR #154). Nhánh feature/PS-105-beneficiary-received-assets, worktree bene105. Không sửa checkout Staff PS-98 của Anti hoặc các task Legal/Admin của Huy. Đã đọc Jira PS-104/105 ngày 20/10/2026, cả hai còn To Do; không cập nhật trạng thái Jira.

Quyết định đã chốt: người nhận chỉ xem tài sản thực sự đã bàn giao cho mình, vẫn xem lại sau session COMPLETED, Vault ARCHIVED và case CLOSED. Invitation/role/ELIGIBLE không cấp quyền xem bí mật sớm.

## Đã chuẩn bị FE

- BeneficiaryHome giữ thông tin tài khoản, multi-role, hướng dẫn, bổ sung lối vào mã mời có sẵn và phần tài sản đã nhận.
- Danh sách, phân trang, chi tiết theo item nhận, nội dung chỉ tải khi yêu cầu, ảnh Blob chỉ tải khi yêu cầu. Không có nút sửa/xóa/giải mã hộ Owner hoặc tự xác nhận bàn giao.
- Hiển thị rõ item archived vẫn được xem; không reuse guard Owner ACTIVE hoặc Staff session OPEN.
- Các trạng thái màn hình chưa liên kết/chờ bàn giao/giao một phần/đã có tài sản chỉ nhận từ adapter, không suy từ role và không coi API lỗi là danh sách rỗng.
- VI/EN, CSS riêng responsive, dialog focus/Escape/restore focus, text hiển thị escape HTML. Đóng/đổi người/đổi phiên/refresh hủy request, bỏ response cũ; không lưu nội dung bí mật vào storage/URL/log. Ảnh tạo URL tạm và revoke khi ẩn/đóng/unmount; lỗi quyền khi đọc chi tiết/nội dung/ảnh đóng màn riêng tư.
- Kiểm tra subjectId/itemId, handover DELIVERED và dữ liệu bất thường ở ranh giới adapter. List chỉ copy các field hiển thị, không giữ payload bí mật lẫn trong list. Đây là defensive FE; BE vẫn chịu authorization.

## Không có contract PS-104 — chưa nối HTTP thật

Rà backend/contract hiện tại chưa thấy API beneficiary đọc Asset đã giao. Các API Owner/Staff không được tái sử dụng để vượt quyền. App nhận tùy chọn beneficiaryAssetActions để nối adapter sau khi PS-104 có contract; mặc định undefined, phiên thật hiện thông báo dịch vụ chưa kết nối và KHÔNG gọi endpoint đoán, KHÔNG fallback mock, KHÔNG hiển thị 0 giả.

Các tên/actions/model dưới đây CHỈ là boundary nội bộ FE, không phải API DTO hay contract đã chốt với Dương:

- actions.list({page,size,accessToken,signal}) -> model phân trang đã normalize, subjectId, items và accountState hiển thị.
- actions.detail(itemId, options) -> metadata item + danh sách định danh ảnh theo phạm vi đã bàn giao.
- actions.content(itemId, options) -> nội dung text được normalize với subject/item.
- actions.image(itemId,imageId,options) -> Blob JPEG/PNG được lấy bằng API theo quyền, không URL công khai.

Model nội bộ: itemId là tham chiếu hạng mục đã giao (không thay bằng một assetId Owner); title/sourceLabel/deliveredAt và trạng thái nguồn giúp hiển thị lịch sử. accountState UNLINKED/AWAITING_HANDOVER/PARTIAL/RECEIVED là trạng thái giao diện minh họa, KHÔNG thêm enum vào DB/BE. Mapper phải được điều chỉnh theo contract PS-104 thực tế; không yêu cầu BE phải dùng tên/enum này. Path HTTP, field thật, re-auth, version/snapshot, download/export, retention/quota và cách xử lý tranh chấp/thu hồi sau giao chưa được tự chốt trong diff.

## Preview cô lập

DEV không đăng nhập: /beneficiary?preview=true. Có nhãn VI/EN “Dữ liệu minh họa — chưa lưu lên máy chủ”. Kịch bản scenario=received|partial|waiting|unlinked|error|slow. Ví dụ received gồm item đã lưu trữ và item đang bàn giao từ hai nguồn tổng hợp; nội dung/ảnh đều giả. Không tạo tài khoản/role mock trong phiên thật.

Production và phiên có accessToken không dùng fixture kể cả query preview=true. Các URL preview là công cụ FE, không phải chứng cứ dữ liệu hoặc quyền sau archive đã được BE triển khai.

## Kiểm chứng và giới hạn

- 13 test mới về model và UI/route App: archive/close, sai subject/item/ELIGIBLE, list bỏ payload, partial/paging, không API Owner fallback, secret escape/cleanup, focus, ảnh URL cleanup, late response đổi tài khoản, 401/403, preview DEV/production/phiên thật và App wiring.
- Log nhóm mới: frontend/bene-focused-app.log (local ignored). Kết quả toàn bộ FE: frontend/ps105-all-tests.log (local ignored).
- Toàn bộ FE: 820/820 đạt, 33 suites, 0 fail/skip. Lint/build/diff-check đạt; còn cảnh báo build chunk lớn vốn có.
- Chưa có API PS-104/SQL Server E2E; việc FE có thể hiển thị item archived bằng adapter/fixture không chứng minh BE đã cấp quyền đọc lịch sử đúng.
- BE localhost:8080 không hoạt động khi kiểm tra. Thử browser trên localhost:5198/beneficiary?preview=true bị ERR_CONNECTION_TIMED_OUT; đã dừng Vite kiểm tra. Cần browser desktop/mobile và contract test với BE thật khi PS-104 bàn giao; không có ảnh browser nghiệm thu trong lần chuẩn bị này.

## Tiếp tục khi PS-104 sẵn sàng

Đồng bộ sau khi PR #155 được merge: tích hợp develop `e4c588f`, xử lý conflict duy nhất tại khai báo App bằng cách giữ đủ `invitationActions`, `beneficiaryAssetActions`, `legalDiscovery`. Không bỏ phần Legal vừa tích hợp hoặc cổng tài sản Beneficiary. Toàn bộ FE 885/885 đạt, 33 suites, 0 fail/skip; lint/build/diff-check đạt trên bản kết hợp. Log local `frontend/ps105-develop-sync-tests.log`. Phạm vi chờ PS-104 và giới hạn E2E/browser phía trên vẫn giữ nguyên.

Bổ sung sau review PR #156: liên kết mã mời từ BeneficiaryHome truyền `lang=vi|en`, giữ ngôn ngữ khi trang đích tải lại. Hai test hồi quy kiểm tra URL cho VI/EN đã thêm vào beneficiaryLanding.test.mjs; chạy lại nhóm này 25/25 đạt, lint/build/diff-check đạt. Không chạy lại toàn bộ suite trong lần sửa liên kết; kết quả 820/820 phía trên thuộc bản bàn giao ban đầu. Chưa có kiểm chứng browser bổ sung.

Đọc lại Jira/contract/PR BE. Viết mapper gọi các API beneficiary đã duyệt, lấy subject từ phiên đã xác minh, không nhận arbitrary recipient từ query. Xác minh các API image/content cũng kiểm tra item/recipient. Nối beneficiaryAssetActions tại composition root và kiểm tra flow: liên kết -> giao một phần -> xem đúng item -> close/archive -> vẫn xem lại. Kiểm tra account khác/role bị đổi/IDOR/ảnh sai item, phiên bản nội dung và ảnh theo lịch sử; không tự dùng Owner password hay mở toàn bộ Vault.

PS-86/87 còn cần bàn giao onboarding mã mời; PS-88 là dữ liệu tại quầy. Diff này không làm lại các task đó. Bàn giao qua PR phần chuẩn bị FE theo yêu cầu của Thái; PS-105 chưa hoàn tất toàn bộ vì đang chờ PS-104. Không tự merge hoặc đánh dấu Jira Done.
