# Quyết định người dùng ngày 19/10/2026

> PS-80 cập nhật 20/10/2026: giữ giá Free/499.000đ/999.000đ, tích hợp mua một lần qua VNPay sandbox theo [payments-vnpay.md](payments-vnpay.md). Phần payment chưa tích hợp bên dưới là lịch sử trước PS-80; `paymentAvailable` nay phụ thuộc cấu hình sandbox.

Tài liệu này thay các quyết định giá tháng/prototype trước đó cho thay đổi đang triển khai; không cập nhật Jira theo yêu cầu người dùng.

| Gói | Giá mua một lần | Số tài sản | Dung lượng |
|---|---:|---:|---:|
| BASIC | Miễn phí | 5 | 100 MiB |
| STANDARD | 499.000 VND | 50 | 1 GiB |
| EXTENDED | 999.000 VND | 200 | 5 GiB |

`billingModel=LIFETIME`. Nâng BASIC → STANDARD trả 499.000; BASIC → EXTENDED hoặc STANDARD → EXTENDED trả đủ 999.000. Không khấu trừ, prorate hay hoàn khoản đã mua. Không gia hạn hoặc hết hạn theo kỳ tháng. Mỗi Owner vẫn chỉ một kho từng tạo thành công; không quota người thụ hưởng.

GET `/subscription-plans` và `/subscriptions/me` là thông tin đọc thật, tách khỏi cờ enforcement. Current DTO vẫn dùng `effectivePlan`, `usage`, `effectiveUntil=null`, `vaultCreated`. FE có adapter cho DTO này.

POST `/subscriptions/me/upgrade-quote`, body `{planCode,catalogVersion}`, trả `{planCode,catalogVersion,amountVnd,currency:"VND",billingModel:"LIFETIME",previousPurchaseCreditVnd:0,paymentAvailable:false}`. Giá và version được server lấy từ catalog; không nhận giá phía client. Đây là báo giá tham khảo, không tạo giao dịch, không cấp gói. POST `/subscriptions/me/upgrade` vẫn trả `SUBSCRIPTION_UPGRADE_UNAVAILABLE` cho tới khi payment được triển khai. Không tin entitlement prototype cũ là bằng chứng đã thanh toán. Quota enforcement bật mặc định từ PS-92 (D-API-42, đề xuất chờ nhóm xác nhận); xem [assets.md](assets.md#quota-nội-dung--ps-77-ps-92-d-api-42).

## Ảnh gắn tài sản

- Tối đa 5 ảnh/tài sản, 5 MiB/ảnh (`5.242.880` byte), JPEG/PNG thật; không nhận PDF/SVG/GIF. Từ chối ảnh hỏng, MIME sai, file rỗng/quá lớn và ảnh vượt 25 triệu pixel để giới hạn chi phí giải mã.
- Ảnh là đính kèm của TEXT/CREDENTIAL, không tạo thêm Asset và không phải di chúc hoặc chứng cứ đã Legal duyệt. Di chúc vẫn là luồng riêng, PDF/JPEG/PNG, 10 MiB và giữ lịch sử phiên bản.
- Byte ảnh đang lưu cộng vào usage cùng payload UTF-8 và mọi version di chúc. Xóa ảnh giải phóng byte ảnh, không sửa lịch sử di chúc.
- AES-GCM với AAD gồm UUID tài sản và UUID ảnh, IV riêng; không ghi nội dung vào audit/log hoặc dùng tên file làm đường dẫn. Không có URL file công khai.
- Chỉ Owner đúng kho; sai role 403, không đúng ownership 404. Mutation chỉ khi Vault ACTIVE, giữ Owner → Vault locks, quota checks và transaction audit. Admin không có quyền xem ảnh chỉ vì có ROLE_ADMIN.
- Xem/tải byte ảnh yêu cầu mật khẩu hiện tại qua policy reauthentication chung, có giới hạn thử. Response attachment, no-store, nosniff. FE chỉ dùng Blob URL trong bộ nhớ và thu hồi khi đóng.

Các đường dẫn bên dưới có tiền tố `/api/v1`:

| Method | Path | Request | Thành công |
|---|---|---|---|
| POST | `/vaults/{vaultId}/assets/with-images` | multipart: `asset` JSON CreateAssetRequest, `images` 1–5 file | 201 AssetResponse |
| GET | `/vaults/{vaultId}/assets/{assetId}/images` | — | 200 danh sách metadata |
| POST | `/vaults/{vaultId}/assets/{assetId}/images` | multipart `images` | 201 danh sách metadata |
| POST | `/vaults/{vaultId}/assets/{assetId}/images/{imageId}/download` | JSON `{password}` | 200 byte ảnh |
| DELETE | `/vaults/{vaultId}/assets/{assetId}/images/{imageId}` | — | 204 |

Metadata: `{id,fileName,contentType,sizeBytes,createdAt}`. Shared errors 400/401/403/404/409/413/415/429; quá số ảnh trả `ASSET_IMAGE_LIMIT_EXCEEDED`. Tạo kèm ảnh atomic: file lỗi rollback cả Asset, không tạo tài sản trùng khi thử lại sau lỗi validation. Multipart request tối đa 27 MiB, từng ảnh vẫn 5 MiB. Slot unique 1–5 ở SQL Server và Owner lock bảo vệ upload đồng thời. Ảnh có thể quản lý trong Chi tiết tài sản.

## Migration và giới hạn xác minh

V31 được giữ nguyên; V32 thêm giá mua trọn đời và phiên bản catalog mới, giữ bản cũ dạng lịch sử, không đổi entitlement/giao dịch. V33 tạo bảng ảnh mã hóa. Không sửa checksum migration đã áp dụng, không reset database hiện có. Migration tăng catalog version có thể làm báo giá cũ stale đúng dự kiến.

Version DTO có `legacyMonthlyPriceVnd` chỉ dành cho cấu hình MONTHLY cũ đã ngừng áp dụng; không hiển thị chúng là gói miễn phí/trọn đời và không bán lại qua catalog mới.

SQL tests dùng database thử có tên `LegacyVault_PS77_*`, không DB làm việc. Bộ test `LifetimeImagesSqlServerTest#lifetime*` kiểm tra round-trip ảnh, ciphertext, ownership/RBAC, rollback, concurrency giới hạn ảnh, publish/retire/stale version và báo giá không cấp quyền. Test riêng `LifetimeUpgradePriceTest` kiểm tra STANDARD → EXTENDED vẫn trả đủ 999.000.
