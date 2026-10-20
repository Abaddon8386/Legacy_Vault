# PS-91 — bằng chứng BE ngày 20/10/2026

Base develop 31c57d3. Nhánh `feature/PS-91-minute-dms-intervals`. Người dùng chốt 1 phút–180 ngày trong phiên thật/production; grace period không đổi. PR chỉ BE/contract, không sửa mock hay tự nối UI của FE.

## Đã kiểm chứng

- PUT ngày cũ và phút mới, GET/readback, server deadline và check-in/Cancel Alert dùng đúng phút, không làm tròn; phút lẻ trả days=null, phút authoritative.
- SQL migration V33 → V36 giữ nguyên legacy 32767 ngày, archived row và toàn bộ timestamps; không UPDATE/backfill hoặc sửa checksum/history. Legacy insert vẫn hoạt động; DB chặn cặp ngày/phút bất nhất/cả hai null.
- Parser dùng Jackson 3 đúng runtime của Spring Boot 4: chặn fractional/string/overflow/field lạ/đơn vị lạ/key trùng; policy chặn cả hai field/missing/âm/0/vượt max. Dùng shared VI/EN errors.
- Ownership/JWT/role; rollback phút/deadline khi audit lỗi; concurrent check-in vs scheduler. Ba ca SQL concurrency DMS hiện hữu chạy opt-in thực: check-in trước scheduler, scheduler trước check-in và configure cạnh tranh.
- Scheduler kiểm biên trước/đúng nextCheckAt; grace giữ một ngày; hết grace chỉ mở verification case, không xác nhận tử vong/unlock. Cancel Alert hủy intake đúng guard cũ và giữ duration phút.
- Test migration Handover bỏ hằng số số lượng migration cũ; vẫn kiểm đủ V28/29/30, bảo toàn kho và migrate lại không sinh thay đổi.

## Kết quả local

`mvnw.cmd '-Dtest=*,!LegacyvaultBackendApplicationTests' clean test` với legal/staff master URL và DMS_SQLSERVER_TEST_URL trỏ DB fixture ngẫu nhiên: **659 tests — 608 pass, 51 skip, 0 failure/error**. Skip thuộc subscription prototype 23 và lifetime images 28; DMS concurrency 3 đã chạy thật. Log `ps91-final.log` bị Git ignore.

Lượt bổ sung `DmsMinuteSqlServerTest,LegacyvaultBackendApplicationTests` trên DB tạm: **8 pass** (7 SQL phút, gồm thêm ca hai Owner; 1 contextLoads). Tổng không trùng lượt chạy **610 pass, 51 skip, 0 failure/error**. DB tạm PS-91 sau cleanup: **0**. Không claim GitHub CI hoặc browser FE/BE E2E. Các test SQL tạo/xóa DB riêng, không dùng DB ứng dụng.

## Giới hạn/handoff

Xem [contract DMS](../api-contracts/dms.md) và OpenAPI. FE mới phải đọc `checkIntervalMinutes`, không ép null days thành một ngày. Scheduler mặc định quét 60 giây, có thể trễ khi backlog; API không hứa exact-second delivery. Những dữ liệu cũ trên 180 ngày không bị rút ngắn; request cấu hình mới chịu max mới.

V34 (PS-86) và V35 (PS-80) là PR đang mở; nếu triển khai cùng V36 thì áp dụng các version thấp trước, hoặc điều phối migration version mới, không bật out-of-order/repair. Rollback binary phải giữ reader phút/ngày nullable; không mất thời lượng đã cấu hình. Không commit handoff/secret/log, không merge hoặc đổi Jira.
