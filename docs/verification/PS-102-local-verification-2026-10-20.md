# PS-102 — kiểm chứng BE ngày 20/10/2026

Base develop 31c57d3, nhánh `feature/PS-102-legal-read-context`. PR BE độc lập với PS-91/PS-80/PS-86; không migration/seed/reset/repair hoặc thay trạng thái Jira.

## Quyền và nghiệp vụ

Queue theo phạm vi **đã có** tại `LegalCaseLookupRepository` và `BasisDossierViewService.forLegal`: Legal đọc verification cases không phụ thuộc assigned Staff. Không tạo assignment Legal, không khám phá các Vault không có case. Chỉ LEGAL_VERIFIER; ADMIN/STAFF/OWNER/BENEFICIARY đơn role không có quyền. Không thêm read/reveal/download Asset, không giải mã và không trả internal keys/secret payload/CCCD.

Context tái sử dụng DTO/service will overview và basis dossier, thêm death-document references, snapshot version/hash/allocation/dispute/review/current approval/Court và capability approval/unlock. Trước phân loại trả dossier/snapshot=null và không giả approved. Legacy approval thiếu version/reviewer chỉ là evidence, không cấp quyền. Closed/archived vẫn đọc trong phạm vi Legal, action bị khóa.

Đọc context theo Vault→Case→Dossier và refresh managed state. Queue JOIN dùng cùng thứ tự (FORCE ORDER) để tránh giữ Case read lock rồi chờ Vault của writer. Các hàm inspect của Court/approval guard dùng cùng điều kiện hiện hữu nhưng trả blocker, không bắt exception từ transactional write guard khiến GET bị rollback-only. Write guards vẫn được kiểm tra lại, cùng error-code và transaction như trước.

Legal duyệt trước, unlock riêng; không thêm flag Legal ở quầy/online. Trực tiếp tại quầy, identity, allocation, delivery/confirmation→close→Staff receipt→archive, quyền item DELIVERED và lịch sử được giữ theo services hiện hữu. SQL fixture mô phỏng chứng từ/identity không phải bằng chứng gặp mặt thật.

## Kiểm thử

- Lượt tập trung đầu: **47 pass**, gồm 12 SQL/HTTP read tests và các guard approval/Court/hold/unlock.
- Hồi quy sạch toàn backend (trừ contextLoads), bật legal/staff SQL opt-in: **665 tests — 611 pass, 54 skip, 0 failure/error**. Skip subscription 23, lifetime images 28, DMS concurrency 3; DMS concurrency đã chạy riêng ở PS-91.
- Ca bổ sung: Closed/ARCHIVED thật qua completion services; legacy approval null snapshot/reviewer; SHA/allocation/dispute đổi dù nhãn FRESH; đọc cạnh tranh hold hai thứ tự, stale first-level cache, queue cạnh tranh writer Vault→Case.
- HTTP thật trên port ngẫu nhiên dùng JWT ký bởi JwtService và DB role thật: 200/no-store, anonymous 401, đổi DB role sang Staff dù token còn claim Legal → 403; body không chứa encrypted bytes/payload/identity/internal identifiers. Không ghi/log token.
- MVC: các role bị chặn, pagination/filter sai 400, UUID không tồn tại 404; queue có metadata thật và tie-break ổn định, empty page thật; GET không ghi audit/dossier/approval hoặc unlock.
- OpenAPI kiểm tra refs/error enum, diff whitespace. Log thô bị Git ignore; kết quả là local, không thay GitHub CI.

Lượt cuối `LegalReadSqlServerTest,SubscriptionContractTest`: **18 pass** (17 SQL/HTTP, 1 OpenAPI), không failure/error. `contextLoads`: **1 pass** trên DB ngẫu nhiên PS-102. Tổng không trùng lượt chạy **613 pass, 54 skip**: thêm ca queue lock-order và context so với bộ hồi quy 665. DB PS-102/Legal fixture còn lại sau cleanup: **0**. Các SQL fixture chỉ tạo/xóa DB riêng, không sử dụng DB ứng dụng.

## Handoff FE và giới hạn

[Contract](../api-contracts/legal-read-context.md) và OpenAPI cung cấp dữ liệu cho PS-99/100/101. FE vẫn cần nối HTTP adapter thay callback discovery, đọc context và giữ kiểm tra stale/abort/session trước mutation. PR không sửa frontend của Huy, không claim hoàn tất browser FE↔BE E2E hoặc bằng chứng gặp mặt tại quầy. Metadata will/dossier tiếp tục giới hạn và quyền của read DTO hiện hữu; không mở endpoint xem nội dung file mới.

Không commit CONTEXT-HANDOFF, secret hoặc log; chưa merge. Test migration cũ được sửa bỏ số lượng hằng 3, giữ kiểm đủ V28/29/30 và bảo toàn kho; không đổi SQL migration.
