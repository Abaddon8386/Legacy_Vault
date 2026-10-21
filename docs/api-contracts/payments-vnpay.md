# PS-80 — mua gói một lần qua VNPay sandbox

Quyết định người dùng 20/10/2026: BASIC Free 0đ (5 tài sản, 100 MiB); STANDARD 499.000đ (50 tài sản, 1 GiB); EXTENDED 999.000đ (200 tài sản, 5 GiB). Mua một lần dùng trọn đời. STANDARD → EXTENDED trả đủ 999.000đ, không khấu trừ. Một kho trọn đời không đổi. Catalog Admin có thể xuất bản giá mới; server chốt giá/version/hạn mức tại lúc tạo đơn. Không bật ngầm cờ quota enforcement.

## Cấu hình

Backend đọc `VNPAY_SANDBOX_ENABLED` (mặc định false), `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL` từ môi trường. Secret chỉ lưu trên máy/secret manager, không đưa vào Git, VITE_* hoặc log. Bật nhưng thiếu cấu hình sẽ từ chối khởi động. Checkout cố định tại sandbox, không có chế độ live.

Return URL là trang Owner `/subscription` hoặc `/subscriptions`, không query/fragment/userinfo; dùng HTTPS, chỉ localhost/127.0.0.1 được HTTP. IPN URL đăng ký với merchant: `https://<backend-public-domain>/api/v1/payments/vnpay/ipn`. Localhost không nhận IPN từ VNPay: cần HTTPS ingress/tunnel do người vận hành cấu hình. Người dùng chưa có merchant sandbox nên chưa chạy giao dịch end-to-end VNPay; callback fixture không phải bằng chứng gateway đã thanh toán. Không thu thập/lưu PAN, CVV hay thông tin thẻ.

## API

- Owner đọc catalog và subscription hiện hành; Free không cần thanh toán.
- `POST /api/v1/subscriptions/me/upgrade-quote` body `{planCode,catalogVersion}` chỉ báo giá. `paymentAvailable` phản ánh cấu hình.
- `POST /api/v1/subscriptions/me/payments` body `{planCode:"STANDARD"|"EXTENDED",catalogVersion,idempotencyKey:<UUID>}` trả 200 `SubscriptionPayment`: `paymentId,planCode,catalogVersion,amountVnd,currency,billingModel,status,createdAt,expiresAt,checkoutUrl`. Checkout hạn 15 phút; gói đã mua không hết hạn. IP lấy từ servlet, không tin X-Forwarded-For tự gửi.
- Cùng Owner/key/body replay cùng đơn; key đổi nội dung hoặc còn đơn chờ chưa hết hạn → 409 `PAYMENT_REQUEST_CONFLICT`. Catalog cũ → `SUBSCRIPTION_CATALOG_STALE`; mua cùng/hạ gói → `SUBSCRIPTION_DOWNGRADE_NOT_ALLOWED`; chưa cấu hình → `SUBSCRIPTION_UPGRADE_UNAVAILABLE`. Giữ key khi retry lỗi mạng.
- `GET /api/v1/subscriptions/me/payments/{paymentId}` chỉ cho Owner xem đơn của mình, đơn khác/không tồn tại cùng trả 404; checkoutUrl=null. Không lộ user ID/secret/callback thô.
- FE xác nhận giá server trước khi sang VNPay; Return query chỉ chọn đơn để đọc từ backend, không cấp gói. Poll tối đa 20 lượt/3 giây. Endpoint `/subscriptions/me/upgrade` cũ vẫn chặn self-grant.

`vnp_TxnRef` là UUID của payment bỏ dấu gạch (32 ký tự hex) để tuân thủ định dạng alphanumeric. FE khôi phục UUID khi đọc trạng thái; ID công khai trong JSON và URL API vẫn là UUID chuẩn.

## Xác thực, concurrency, rollback

Chỉ GET IPN công khai; API Owner cần JWT/role. Theo [VNPay PAY 2.1.0](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html): sắp xếp/encode US-ASCII form, HMAC-SHA512, constant-time comparison, chặn key trùng/hash sai/quá dài. Kiểm merchant, TxnRef, tiền VND ×100, trạng thái, số giao dịch, pay date. Currency callback thường không có; nếu có bắt buộc VND. Chỉ response/status cùng `00` mới thành công; thất bại terminal chỉ khi status `02` và response khác `00`; trạng thái trung gian/bất nhất trả `99` để retry. Return URL không ghi kết quả.

Khóa Owner → payment; tạo đơn còn khóa catalog với Admin publish. Unique Owner/key chống tạo lặp; unique merchant/gateway transaction chống dùng một giao dịch cho hai đơn. Payment và audit cùng transaction. Ghi lỗi/audit lỗi rollback trước khi controller trả `99`. Callback terminal lặp trả `02`, không audit/grant trùng. First terminal result wins; mâu thuẫn terminal cần đối soát merchant, không tự sửa chứng từ.

V35 thêm bảng độc lập, không tin entitlement prototype. Chỉ `SUCCEEDED` mới là bằng chứng, effective plan lấy tier cao nhất đã trả; snapshot giá/hạn mức/version không đổi theo catalog. Callback cũ không hạ gói; IPN đến muộn nhận nếu pay date trong checkout window, không ở tương lai. `EXPIRED` chỉ là trạng thái hiển thị; bản ghi vẫn chờ IPN. Owner bị vô hiệu hóa vẫn được ghi nhận IPN, còn đăng nhập/API giữ guard hiện hành.

Hết checkout có thể tạo đơn mới. Nếu đơn cũ đã trả nhưng IPN trễ, cả hai khoản trả phải được lưu; cần đối soát trước khi trả lại khi chưa rõ kết quả. Không có tự động hoàn tiền, QueryDR hoặc live payment trong phiên bản sandbox.

Không sửa migration/checksum/schema history hoặc dữ liệu kho. Base develop hiện là V33; V34 được dành cho PR PS-86 đang mở, PS-80 dùng V35 độc lập. Để ngừng checkout đặt `VNPAY_SANDBOX_ENABLED=false`; gói đã xác nhận vẫn đọc được. Tắt cũng dừng IPN, nên đối soát đơn đang chờ hoặc bật lại để VNPay retry. Không drop bảng khi có đơn, không rollback về binary cũ bỏ qua gói đã mua: giữ reader/IPN tương thích hoặc roll forward bản sửa. Backup/đối soát trước bảo trì. Không bật request-query/TRACE logging khi triển khai callback.

Admin PS-82 transaction search vẫn pending ở phân hệ riêng; PS-80 có trạng thái cho Owner và audit, chưa nối UI tra cứu Admin.

**Thứ tự triển khai:** PS-86 PR #151 đang giữ V34. Nếu sẽ triển khai cả hai, áp dụng V34 trước V35. Nếu một database đã chạy V35 mà chưa có V34, phải điều phối một migration phiên bản mới cho PS-86; không bật out-of-order hoặc chỉnh schema history để vượt kiểm tra. PR PS-80 không tự merge PS-86.
