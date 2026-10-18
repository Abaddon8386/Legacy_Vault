# PS-46–48: bản vá review 2026-10-17

Đối chiếu `review-PS-46-47-48-cho-An.md` với `origin/develop` tại `2a1ad38`.
Cập nhật trực tiếp các nhánh của PR #93, #94, #97; không tạo PR mới.

## Các điểm xử lý

1. Đã tái hiện 3 lỗi `The url cannot be null` khi thiếu `LEGAL_SQLSERVER_MASTER_URL`.
   Đặt `@EnabledIfEnvironmentVariable` trên từng lớp `LegalRouteSqlServerTest`,
   `CourtDecisionSqlServerTest`, `LegalHoldSqlServerTest`; không dựa vào annotation ở lớp cha.
2. Chủ dự án chốt PS-46 → PS-47 → PS-48 trước; PS-47 giữ V16, PS-48 giữ V17.
   Thành viên phụ trách PS-37 v2 điều chỉnh V16 của mình trước khi tích hợp.
   PS-77 xử lý sau, cũng phải đổi các số đang trùng. Không sửa migration đã nằm trên develop.
3. Đã đồng bộ develop vào PS-46, lan truyền lên PS-47 và PS-48. Develop hiện chưa có
   enum mới của PS-37 nên chưa phát sinh xung đột cần hòa giải. Khi PS-37 tích hợp phải
   giữ cả các giá trị audit/error của hai phía và chạy lại hồi quy.
4. Giữ lịch sử merge main đã có để tránh viết lại ba PR đang review.
   Lần cập nhật này chỉ đồng bộ develop và các nhánh trong chuỗi; không thêm merge main.
5. Audit `COURT_DECISION_RECORDED`: sửa step `ST-16` → `ST-20`, giữ `LV-COURT-001`.
   Test SQL Server xác nhận cả step và rule được lưu trong audit; contract đã cập nhật.

## Cách kiểm chứng

Dùng Maven với Mockito javaagent đã có trong máy để tránh lỗi self-attach của JDK 25.

- Thiếu DB: bỏ `DB_URL`, `LEGAL_SQLSERVER_MASTER_URL`, `STAFF_SQLSERVER_MASTER_URL`, chạy `clean test`.
  `contextLoads` vẫn yêu cầu DB; không tắt hoặc nới lỏng kiểm thử này.
- Có DB: chạy trên DB tạm ngẫu nhiên, Flyway đầy đủ; SQL integration tests tự tạo/xóa DB riêng.
  Không dùng database ứng dụng của người dùng và không ghi khóa thử nghiệm vào repo.
- Log đầy đủ nằm trong các file bị ignore ở `backend/ps48-review-*.log`.

## Kết quả thiếu DB

`clean test`: 351 ca được báo cáo, 295 pass, 55 skipped, 0 failure, 1 error.
Error duy nhất là `LegacyvaultBackendApplicationTests.contextLoads` vì thiếu `DB_URL`.
Ba lớp SQL mới: LegalRoute 5/5 skipped; CourtDecision 6/6 skipped; LegalHold 12/12 skipped.
Đã tái hiện trước vá: 3 error ở `LegalBasisSqlServerSupport.startDatabase`.
Sau vá: không còn lỗi khởi tạo URL null.

Log: `backend/ps48-review-no-db.log`, tổng hợp XML trong `backend/ps48-review-no-db-summary.log`.

## Kết quả có SQL Server

`clean test`: 352 ca, 349 pass, 3 skipped, 0 failure, 0 error.
`contextLoads` và Flyway đầy đủ 18 migration đều thành công.
53 ca SQL Server đã chạy thành công: IdentityVerification 20, TrusteeContact 10,
LegalRoute 5, CourtDecision 6, LegalHold 12. Nhóm legal gồm 23 ca, có kiểm tra race
hold với intake/forward/court assessment, audit rollback và step/rule COURT mới.
Các ca DMS SQL opt-in riêng vẫn bị bỏ qua vì chưa bật biến của suite đó.
Lượt riêng trên nhánh PS-47: 11/11 SQL tests pass.

Log: `backend/ps48-review-sql.log`, tổng hợp XML trong `backend/ps48-review-sql-summary.log`.
Database tạm được xóa sau kiểm thử. `git diff --check` không báo lỗi.


