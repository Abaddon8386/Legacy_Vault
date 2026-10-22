# Hướng dẫn demo mua và nâng cấp gói qua VNPay sandbox

Kiểm tra ngày 22/10/2026 tại checkout `C:\Users\hai\Downloads\FALL26\SWP\Legacy_Vault`, remote `https://github.com/Abaddon8386/Legacy_Vault.git`, nhánh `feature/PS-96-fe-court-integration`.

Chỉ thanh toán online qua sandbox. Không có bước thanh toán tiền mặt, không thu tiền thật, không tự cấp gói bằng sửa DB.

## 1. Kết quả kiểm tra

| Hạng mục | Kết quả |
|---|---|
| FE chọn gói, báo giá, xác nhận, chuyển cổng và đọc kết quả | Có `PaymentCheckout.jsx` và `paymentService.js` |
| BE tạo/đọc giao dịch, ký yêu cầu, xác minh IPN | Có PaymentController/PaymentService/VnPayGateway |
| IPN không cần đăng nhập | GET `/api/v1/payments/vnpay/ipn` được permitAll; chữ ký vẫn được xác minh |
| Chỉ cấp gói từ thanh toán được BE xác minh | Có; quay về trang thành công không tự cấp gói |
| Migration | Có V34 và V35 trong source; chưa xác nhận lịch sử áp dụng DB local |
| Kiểm thử frontend | 9/9 paymentService/paymentComponent qua |
| Kiểm thử backend | 4/4 VnPayGatewayTest/LifetimeUpgradePriceTest qua |
| SQL integration/giao dịch VNPay thật trong sandbox | Chưa chạy trong lần kiểm tra này |
| Bốn biến VNPAY_* | Không có trong Process/User/Machine của phiên kiểm tra; file local hiện có cũng không khai báo |
| DB/JWT/encryption | Có file local `.env.ps34-local.ps1` được Git ignore, khai báo các biến cần thiết; không in giá trị, chưa xác nhận kết nối/khóa hoạt động |
| Tunnel | Không tìm thấy `ngrok` hoặc `cloudflared` trong PATH; không có nghĩa chắc chắn chưa cài nơi khác |
| Cổng runtime | TCP loopback 8080, 5173, 1433 không kết nối được tại thời điểm kiểm tra; không kết luận SQL instance khác không chạy |

Script `start-local.ps1` chạy BE cổng **8080**, FE **5194**. Hướng dẫn này dùng `http://localhost:5194/subscription`, không dùng 5173. Trạng thái handoff có thể cũ; nhánh trên được đọc từ Git thực tế.

## 2. Các phần còn thiếu để demo xuyên suốt

1. Thông tin merchant sandbox thật của bạn: TmnCode và HashSecret. Chưa có bằng chứng đã được cấp; chỉ xác minh được hiện chưa cấu hình trong các nơi đã kiểm tra.
2. Đường HTTPS công khai nhận IPN và việc đăng ký URL đó với merchant VNPay.
3. Bật cấu hình sandbox trong tiến trình backend.
4. Khởi động BE/FE theo cấu hình local hiện hữu, xác minh DB và migration.
5. Chạy một giao dịch sandbox thành công, kiểm tra gói lưu lại sau tải trang; sau đó thử nâng cấp.

## 3. Đăng ký merchant sandbox

Truy cập [đăng ký merchant test VNPay](https://sandbox.vnpayment.vn/devreg/), dùng email bạn kiểm soát. Theo tài liệu VNPay, thông tin kết nối được gửi về email đăng ký. Làm theo biểu mẫu hiện hành; không dùng mã merchant/secret ví dụ trong unit test.

Thông tin mô tả có thể dùng:

```text
Tên website: LegacyVault Demo
Mô tả: Demo mua và nâng cấp gói quản lý di sản số, thanh toán thử một lần qua VNPay sandbox.
```

Nếu biểu mẫu yêu cầu website công khai, cung cấp website demo thật đang truy cập được; không bịa URL. Backend tunnel ở bước sau dùng cho callback, không phải trang giao diện website. Khi cần public frontend, phải cấu hình triển khai/tunnel FE riêng; không coi URL backend là website FE.

Giữ TmnCode/HashSecret trên máy, không dán secret vào chat, Git, ảnh demo hoặc biến `VITE_*`.

## 4. Tạo đường HTTPS nhận IPN

Cài ngrok theo [hướng dẫn Windows chính thức](https://ngrok.com/download/windows), tạo tài khoản và làm bước xác thực ngrok theo dashboard. Token ngrok khác HashSecret VNPay.

Mở PowerShell riêng:

```powershell
ngrok http 8080 --inspect=false
```

Lệnh công bố dịch vụ cổng 8080 qua HTTPS; chỉ bật trong thời gian demo cần callback. `--inspect=false` tắt HTTP introspection của agent. Không bật log query callback ở ứng dụng hoặc công cụ ghi traffic.

Lấy URL HTTPS thực ngrok cấp, ví dụ `https://TEN-MIEN-CUA-BAN.ngrok-free.app`. Đăng ký IPN trong cấu hình merchant hoặc theo kênh cấu hình do VNPay cung cấp:

```text
https://TEN-MIEN-CUA-BAN.ngrok-free.app/api/v1/payments/vnpay/ipn
```

Không dùng `localhost` làm IPN. Không thêm Basic Auth hoặc trang đăng nhập trước IPN vì máy chủ VNPay không có phiên người dùng. Chữ ký VNPay là kiểm tra bắt buộc trong BE. Nếu URL tunnel đổi, cập nhật URL IPN đăng ký trước khi tạo giao dịch mới.

Phân biệt:

| URL | Ai dùng | Giá trị cho demo trên máy này |
|---|---|---|
| Return URL | Trình duyệt của bạn quay về FE | `http://localhost:5194/subscription` |
| IPN URL | VNPay gọi server-to-server | `https://<domain-thật>/api/v1/payments/vnpay/ipn` |

Không có biến `VNPAY_IPN_URL` trong code hiện tại. IPN được đăng ký phía merchant, không đặt thay Return URL.

## 5. Cấu hình và chạy backend

Mở PowerShell tại repo. Đoạn sau nhập TmnCode và che HashSecret khi gõ; chỉ đặt biến trong terminal này, không ghi secret vào file:

```powershell
Set-Location 'C:\Users\hai\Downloads\FALL26\SWP\Legacy_Vault'
$env:VNPAY_TMN_CODE = (Read-Host 'Nhap TmnCode sandbox do VNPay cap').Trim()
$vnSecretInput = Read-Host 'Nhap HashSecret sandbox (an ky tu)' -AsSecureString
$env:VNPAY_HASH_SECRET = [System.Net.NetworkCredential]::new('', $vnSecretInput).Password
Remove-Variable vnSecretInput
$env:VNPAY_RETURN_URL = 'http://localhost:5194/subscription'
$env:VNPAY_SANDBOX_ENABLED = 'true'
.\start-local.ps1 -Service backend
```

Backend nhận thêm DB/JWT/khóa mã hóa/DLL qua file local hiện có được script nạp. Không tạo lại encryption key vì có thể làm dữ liệu cũ không giải mã được. Spring không tự nạp `.env` bất kỳ.

TmnCode được code yêu cầu đúng 8 ký tự A–Z/0–9; secret ít nhất 16 ký tự. Dùng chính xác giá trị được cấp. Return URL không có query/fragment; chỉ localhost/127.0.0.1 được HTTP.

Chờ BE khởi động thành công. Nếu Flyway/DB lỗi, xử lý nguyên nhân trước; không reset DB, repair checksum hoặc bật out-of-order để vượt lỗi. Có V35 trong source chưa chứng minh DB đã áp dụng. Khi cần xác nhận, xem log Flyway và lịch sử migration của đúng database hiện hành, không công khai DB_URL chứa bí mật.

## 6. Chạy frontend

Mở terminal khác:

```powershell
Set-Location 'C:\Users\hai\Downloads\FALL26\SWP\Legacy_Vault'
.\start-local.ps1 -Service frontend
```

Truy cập `http://localhost:5194`, đăng nhập bằng Owner demo thật rồi mở `/subscription`. Không dùng `preview=true`, fixture hoặc tài khoản Staff/Legal cho luồng mua.

Đăng nhập và quay về thanh toán đều dùng cùng host `localhost`; không đổi sang `127.0.0.1` giữa chừng. Giữ BE, FE, tunnel chạy suốt giao dịch. Nếu FE báo cổng bị chiếm, xử lý tiến trình đang dùng thay vì tự đổi cổng mà quên cập nhật Return URL.

## 7. Kiểm tra kết nối IPN trước giao dịch

Mở URL IPN HTTPS bằng trình duyệt khi chưa có query. Vì không có chữ ký, theo code hiện tại kỳ vọng JSON từ BE:

```json
{"RspCode":"97","Message":"Invalid signature"}
```

Kết quả này chỉ xác nhận request tới handler và bị chặn đúng khi thiếu chữ ký; chưa chứng minh merchant đã đăng ký IPN hoặc thanh toán hoạt động. Nếu nhận HTML/ngrok warning/login/404/502, phải xử lý đường callback trước. Không xem trang HTML là IPN đã thông.

## 8. Mua rồi nâng cấp

1. Dùng Owner riêng đang BASIC, không dùng hồ sơ chính đã có gói EXTENDED.
2. Chọn STANDARD, kiểm tra giá backend/catal​og, xác nhận và bấm tiếp tục VNPay.
3. Thanh toán bằng thông tin thử được VNPay cung cấp tại [tài liệu PAY sandbox](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html). Không dùng thẻ thật, không tự tạo số thẻ/OTP.
4. Quay về `/subscription`, đợi BE nhận và xác minh IPN.
5. Chỉ khi trạng thái BE là SUCCEEDED mới kỳ vọng STANDARD; tải lại trang kiểm tra gói/hạn mức.
6. Tiếp tục chọn EXTENDED, trả đủ giá đích; lặp lại để demo nâng cấp.
7. Kiểm tra giao dịch thất bại/hủy không cấp gói. Refresh/return success query không được tự cấp gói.

Giá contract mặc định: STANDARD 499.000đ, EXTENDED 999.000đ, trọn đời. STANDARD → EXTENDED trả đủ 999.000đ, không trừ tiền lần trước. Nếu Admin đã xuất bản catalog mới, dùng giá/version backend đang trả. Mua lại cùng gói hoặc hạ gói bị chặn.

## 9. Chẩn đoán

| Hiện tượng | Kiểm tra |
|---|---|
| Sandbox chưa cấu hình | Bốn biến VNPAY trong chính terminal BE; khởi động lại BE sau thay đổi |
| BE không khởi động vì cấu hình VNPay | TmnCode/secret/Return URL đúng định dạng; không để khoảng trắng |
| Quay về trang không mở được | FE đang chạy 5194; Return URL đúng host/cổng |
| VNPay thành công nhưng gói còn BASIC/PENDING | IPN đã đăng ký đúng URL chưa; tunnel còn chạy; callback trả JSON đúng không; merchant/secret đúng môi trường |
| Quá thời gian chờ UI | FE chỉ poll khoảng 1 phút; tải lại hoặc đọc lại trạng thái, không sửa DB/self-grant |
| Chữ ký sai/RspCode 97 | Sai secret/merchant hoặc callback thiếu/bị sửa tham số; không in query/secret lên log |
| PAYMENT_REQUEST_CONFLICT | Có đơn chờ hoặc retry khác nội dung; giữ lần retry cũ; checkout hạn 15 phút; đối soát nếu cổng đã trả nhưng IPN trễ |
| SUBSCRIPTION_CATALOG_STALE | Tải lại catalog và báo giá mới |
| SUBSCRIPTION_DOWNGRADE_NOT_ALLOWED | Chọn gói cao hơn; dùng Owner BASIC khác để tập lại |

Không tạo đơn mới liên tục khi cổng đã báo trả nhưng BE chưa nhận IPN; kiểm tra callback/đối soát trước.

## 10. Giới hạn và bằng chứng cần lưu

Đã có kiểm thử cục bộ cho FE/gateway/giá. Chưa có giao dịch sandbox thật hoặc xác minh DB runtime trong lần kiểm tra này. Không tuyên bố demo đã sẵn sàng trước khi có đủ:

- [ ] BE/FE chạy và đọc subscription/catalog thật.
- [ ] IPN HTTPS tới đúng handler, merchant đăng ký đúng URL.
- [ ] STANDARD thanh toán sandbox SUCCEEDED và gói lưu bền sau refresh.
- [ ] EXTENDED nâng cấp thành công với đủ giá gói đích.
- [ ] Thất bại/hủy không cấp gói; đúng quyền Owner.
- [ ] Ảnh minh chứng không chứa secret/token/thông tin thẻ/query callback.

Jira PS-80 đọc ngày 21/10 còn mô tả gói tháng cũ, trong khi source/contract ngày 20/10 dùng gói trọn đời; ghi nhận lệch tài liệu, không tự cập nhật Jira ở tác vụ này.

Nguồn: [contract VNPay trong repo](api-contracts/payments-vnpay.md), `start-local.ps1`, `application.yaml`, PaymentCheckout, PaymentController, PaymentService, VnPayGateway, [đăng ký VNPay](https://sandbox.vnpayment.vn/devreg/), [tài liệu PAY](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html), [ngrok Windows](https://ngrok.com/download/windows), [ngrok CLI](https://ngrok.com/docs/gateway/agent/cli).
