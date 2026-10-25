# KỊCH BẢN DEMO LEGACYVAULT — GIA ĐÌNH NGUYỄN MINH AN

Ngày biên soạn: 21/10/2026. Lưu theo yêu cầu người dùng để diễn tập sau khi hoàn thành các task cuối.

## 0. Phạm vi và mức độ xác minh

- Repository nhóm: https://github.com/Abaddon8386/Legacy_Vault.
- Toàn bộ tên người, tài khoản, mật khẩu, tài sản và giấy tờ bên dưới là dữ liệu tổng hợp phục vụ demo; không phải tài khoản đã được tạo.
- Quyết định COURT-only trong Jira PS-102/103 ngày 20/10/2026 được dùng cho kịch bản: di chúc là tài liệu đối chiếu, không thay văn bản Tòa án để mở khóa. Không demo nhánh công chứng như đường thay thế.
- Xác minh danh tính thực hiện trực tiếp ngoài hệ thống. Không tạo/upload CCCD, hộ chiếu hoặc kết quả MATCH giả để vượt guard.
- Kịch bản hoàn chỉnh là mục tiêu nghiệm tập, không chứng nhận FE → BE → SQL Server đã chạy xuyên suốt. Cần kiểm tra lại bản tích hợp và Jira trước buổi demo; không suy trạng thái hiện hành từ tài liệu lưu này.
- Lần đọc Jira trong cuộc trao đổi ngày 21/10/2026: PS-95–98 To Do; PS-99–103 Done. Trạng thái Done không chứng minh code đã có trong checkout hay runtime hoạt động.
- **Đính chính phần thanh toán ở bản trả lời ban đầu:** checkout khi lưu tài liệu đã có PS-80 mua/nâng cấp gói trọn đời qua VNPay sandbox và FE PaymentCheckout. Không giữ kết luận cũ “payment chưa tích hợp”. Khả năng chạy phụ thuộc cấu hình merchant/callback; tài liệu hiện ghi chưa có bằng chứng giao dịch VNPay E2E. Chưa có live payment. Xem mục 12.

## 1. Câu chuyện demo

Nguyễn Minh An muốn lưu giữ tài khoản ảnh gia đình, tài khoản quản lý tên miền và những lời nhắn dành cho hai người con.

An tạo kho di sản, khai báo người tin cậy và người thụ hưởng, tải bản di chúc rồi thiết lập kiểm tra hoạt động định kỳ.

Sau một khoảng thời gian không phản hồi và hết thời gian gia hạn, hệ thống chuyển hồ sơ sang quy trình xác minh. Staff tiếp nhận giấy tờ; Legal kiểm tra và phê duyệt phân bổ theo văn bản Tòa án. Sau bước mở khóa riêng, Staff gặp trực tiếp từng người nhận để bàn giao và ghi nhận ký nhận.

## 2. Bộ nhân vật để nhập liệu

### Chủ kho — Nguyễn Minh An

```text
Họ tên: Nguyễn Minh An
Ngày sinh: 1980-03-15
Email: an.owner.demo@example.com
Điện thoại: 0900000101
Mật khẩu tài khoản demo: LegacyDemo!2026An
```

Email trên dùng cho dữ liệu thử nghiệm. Nếu cần nhận thư thật, thay bằng hộp thư demo do nhóm kiểm soát. Số điện thoại là giá trị mẫu, không dùng gọi/gửi SMS.

### Người tin cậy — Trần Thu Hà

```text
Họ tên: Trần Thu Hà
Quan hệ: Vợ
Email: ha.trustee.demo@example.com
Điện thoại: 0900000102
```

Vai trò: liên hệ với Staff và mang giấy tờ đến quầy. Không tự động được nhận tài sản chỉ vì là Trustee.

### Người thụ hưởng 1 — Nguyễn Gia Linh

```text
Họ tên: Nguyễn Gia Linh
Quan hệ: Con gái
Ngày sinh: 2002-05-20
Email: linh.beneficiary.demo@example.com
Điện thoại: 0900000103
Mật khẩu tài khoản demo khi cần tạo: LegacyDemo!2026Linh
```

### Người thụ hưởng 2 — Nguyễn Gia Bảo

```text
Họ tên: Nguyễn Gia Bảo
Quan hệ: Con trai
Ngày sinh: 2004-08-12
Email: bao.beneficiary.demo@example.com
Điện thoại: 0900000104
Mật khẩu tài khoản demo khi cần tạo: LegacyDemo!2026Bao
```

Không cần tạo ảnh CCCD hoặc nhập số định danh nếu trường đó không bắt buộc.

### Nhân viên và chuyên viên pháp lý

```text
Tên hiển thị Staff mong muốn: Lê Hoàng Nam
Tên hiển thị Legal mong muốn: Phạm Ngọc Mai
```

Dùng tài khoản Staff/Legal đã được cấp đúng quyền trong môi trường demo. Tên trên là nhân vật đề xuất, không phải tài khoản đã tồn tại.

## 3. Kho di sản

```text
Tên kho: Di sản số gia đình Nguyễn Minh An

Mô tả:
Lưu giữ tài khoản số, hướng dẫn quản lý và những lời nhắn của Nguyễn Minh An dành cho gia đình. Việc bàn giao thực hiện theo căn cứ Tòa án được Legal thẩm định và phê duyệt.
```

Chỉ tạo một kho cho Owner này. Nếu tập lại từ đầu, chuẩn bị Owner demo khác; không dự kiến xóa kho để tạo lại cùng tài khoản.

## 4. Bốn tài sản để copy-paste

Dùng hai tài sản dạng tài khoản và hai dạng văn bản. Ảnh là minh họa đính kèm, không phải tài sản dạng FILE.

### TS-01 — Tài khoản lưu ảnh gia đình

```text
Tên tài sản: Tài khoản lưu ảnh gia đình An – Hà
Loại: Tài khoản / CREDENTIAL

Mô tả:
Tài khoản minh họa lưu giữ ảnh và video gia đình. Dự kiến bàn giao cho Nguyễn Gia Linh theo văn bản căn cứ được Legal duyệt.

Tên đăng nhập: an.family.archive@example.com
Mật khẩu: DemoOnly!Family2026

Ảnh đính kèm: TS01_Album_Gia_Dinh.jpg
```

### TS-02 — Tài khoản quản lý tên miền

```text
Tên tài sản: Tài khoản quản lý tên miền anheritage.example
Loại: Tài khoản / CREDENTIAL

Mô tả:
Tài khoản minh họa quản lý tên miền website gia đình. Dự kiến bàn giao cho Nguyễn Gia Bảo theo văn bản căn cứ được Legal duyệt.

Tên đăng nhập: an.domain.admin@example.com
Mật khẩu: DemoOnly!Domain2026

Ảnh đính kèm: TS02_Ten_Mien.jpg
```

### TS-03 — Thư gửi Gia Linh

```text
Tên tài sản: Thư của ba gửi Gia Linh
Loại: Văn bản / TEXT

Mô tả:
Lời nhắn riêng của Nguyễn Minh An dành cho con gái Nguyễn Gia Linh.

Nội dung:
Gia Linh thân mến,

Ba để lại cho con tài khoản lưu ảnh gia đình và những kỷ niệm đã cùng nhau gìn giữ.

Con hãy sao lưu ảnh ra một nơi an toàn, giữ nguyên những album gốc và chia sẻ lại với mẹ cùng em Bảo.

Điều ba mong nhất là gia đình mình luôn dành thời gian cho nhau.

Thương con,
Ba An.

Ảnh đính kèm: TS03_Thu_Gia_Linh.jpg
```

### TS-04 — Hướng dẫn dành cho Gia Bảo

```text
Tên tài sản: Hướng dẫn quản lý website gia đình
Loại: Văn bản / TEXT

Mô tả:
Hướng dẫn dành cho Nguyễn Gia Bảo khi tiếp nhận tài khoản quản lý tên miền và website gia đình.

Nội dung:
Gia Bảo thân mến,

Sau khi được bàn giao tài khoản quản lý tên miền anheritage.example, con hãy:

1. Kiểm tra thông tin tài khoản và đổi mật khẩu.
2. Cập nhật thông tin liên hệ bằng thông tin của con.
3. Kiểm tra thời hạn tên miền và lịch gia hạn.
4. Sao lưu nội dung website trước khi chỉnh sửa.
5. Giữ lại chuyên mục kỷ niệm gia đình.

Tên miền và tài khoản trong bản demo này đều là dữ liệu minh họa.

Ba An.

Ảnh đính kèm: TS04_Huong_Dan_Website.jpg
```

### Phân bổ thống nhất trong giấy tờ

| Người nhận | Tài sản |
|---|---|
| Nguyễn Gia Linh | TS-01 và TS-03 |
| Nguyễn Gia Bảo | TS-02 và TS-04 |

TS-01…TS-04 chỉ là mã gọi trong kịch bản. Khi nhập phân bổ, chọn tài sản thật trên hệ thống, không nhập mã này thay UUID.

Owner chỉ khai báo người thụ hưởng. Phân bổ chính thức được Staff nhập theo văn bản Tòa án và Legal duyệt.

## 5. Các giấy tờ cần chuẩn bị

| Tên file đề xuất | Nội dung | Tải ở đâu |
|---|---|---|
| GT01_Di_Chuc_An_20260915.png | Di chúc minh họa của An | Owner → Di chúc |
| GT02_Trich_Luc_Khai_Tu_An.png | Trích lục khai tử minh họa | Staff → Hồ sơ giấy tờ tử vong |
| GT03_Di_Chuc_Goc_Doi_Chieu.png | Bản số hóa cùng bản di chúc giấy | Staff → Tiếp nhận di chúc gốc |
| GT04_Quyet_Dinh_Toa_An_V1.png | Văn bản phân chia 4 tài sản cho 2 người | Staff → Văn bản căn cứ Tòa án |
| GT05_Ky_Nhan_Gia_Linh.png | Biên bản ký nhận minh họa | Đạo cụ tại quầy; chưa mặc định hỗ trợ upload |
| GT06_Ky_Nhan_Gia_Bao.png | Biên bản ký nhận minh họa | Tương tự GT05 |

GT01 và GT03 phải cùng nội dung. Có thể dùng cùng ảnh, lưu thành hai tên file để đóng vai bản Owner lưu trước và bản Staff số hóa từ bản giấy. Không dùng hai ảnh khác nội dung rồi chọn “Khớp”.

Không cần tạo hoặc upload:

- CCCD/hộ chiếu của Owner hoặc người thụ hưởng.
- Ảnh khuôn mặt, ảnh eKYC.
- Văn bản phân chia công chứng cho luồng mới.
- Giấy tờ nhà đất, đăng ký xe hoặc sao kê ngân hàng cho bộ tài sản số này.

Danh tính do Staff đối chiếu trực tiếp ngoài hệ thống. Mã mời hoặc liên kết tài khoản không thay thế việc đó.

### Định dạng và dung lượng

- Di chúc và chứng cứ Staff: PDF/JPEG/PNG, tối đa 10 MiB/tệp theo validation đã đọc.
- Ảnh tài sản: JPEG/PNG, tối đa 5 ảnh/tài sản, 5 MiB/ảnh.
- Nên xuất ảnh khoảng 1–3 MB để tải nhanh.
- Lưu PNG/JPEG thật; không đổi đuôi ảnh thành PDF.
- Nếu Gemini xuất PNG thì giữ đuôi PNG cho ảnh tài sản dù danh sách gợi ý đang đặt JPG.

## 6. Metadata giấy tờ để copy-paste

### Bản di chúc Owner tải lên

```text
Ngày lập trên tài liệu: 2026-09-15

Ghi chú tải lên:
Bản di chúc minh họa của Nguyễn Minh An, lập ngày 15/09/2026. Dùng để lưu trữ và đối chiếu trong buổi demo LegacyVault.
```

### Trích lục khai tử

```text
Loại giấy tờ: Trích lục khai tử
Người được ghi nhận: Nguyễn Minh An
Ngày mất trong tình huống giả định: 2026-10-10
Cơ quan cấp: Cơ quan hộ tịch Minh Hòa — đơn vị giả định
Số văn bản: DEMO-KT-2026-001
Ngày cấp: 2026-10-12
Tham chiếu hồ sơ giấy: DEMO-HS-AN-001/KT

Ghi chú:
Tài liệu tổng hợp phục vụ demo. Staff ghi nhận tiếp nhận; kết luận thẩm định thuộc Legal.
```

Nếu màn hình có thông tin người nộp:

```text
Người nộp: Trần Thu Hà
Quan hệ với chủ kho: Vợ / Người tin cậy
Điện thoại: 0900000102
Email: ha.trustee.demo@example.com
```

Thời gian tiếp nhận dùng thời gian thực của buổi diễn tập hoặc do hệ thống ghi nhận, không dùng thời gian giả thay dấu thời gian hệ thống.

### Tiếp nhận di chúc gốc

```text
Người giao: Trần Thu Hà
Quan hệ: Vợ của chủ kho / Người tin cậy
Tham chiếu hồ sơ giấy: DEMO-HS-AN-001/DC

Tình trạng bản gốc:
Bản giấy minh họa một trang, đầy đủ nội dung, không rách hoặc mất góc. Nội dung tương ứng bản Owner đã lưu ngày 15/09/2026.
```

### Văn bản Tòa án

```text
Loại văn bản: Quyết định Tòa án
Cơ quan ban hành: Tòa án Minh Hòa — đơn vị giả định
Số văn bản: DEMO-TA-2026-015
Ngày ban hành: 2026-10-18
Tham chiếu hồ sơ giấy: DEMO-HS-AN-001/TA/V1

Ghi chú:
Văn bản minh họa phân chia bốn tài sản số của Nguyễn Minh An cho Nguyễn Gia Linh và Nguyễn Gia Bảo. Phân bổ nhập theo đúng nội dung văn bản.
```

Không tự nhập phiên bản/hash vào trường không có trên UI. Hệ thống xác định theo contract.

## 7. Prompt Gemini tạo giấy tờ và ảnh tài sản

Tạo từng ảnh riêng. Giấy tờ phải có watermark rõ để nhận biết là dữ liệu demo.

### Prompt 1 — Di chúc, dùng cho GT01 và GT03

```text
Tạo ảnh một tài liệu minh họa phục vụ demo phần mềm LegacyVault, khổ A4 dọc, nhìn thẳng từ trên xuống, nền giấy trắng, chữ đen rõ và dễ đọc, ánh sáng đều, không có vật che.

Đây là đạo cụ hư cấu, không phải giấy tờ thật. Không dùng quốc huy, con dấu cơ quan thật, chữ ký thật, mã QR hoặc mã xác thực. Đặt watermark lớn màu xám nhạt trên trang:
“MẪU DEMO — KHÔNG CÓ GIÁ TRỊ PHÁP LÝ”.

Tiêu đề:
DI CHÚC — BẢN MINH HỌA

Nội dung tiếng Việt:
Người lập: Nguyễn Minh An
Ngày sinh: 15/03/1980
Ngày lập: 15/09/2026

Danh mục tài sản số và nguyện vọng:
1. Tài khoản lưu ảnh gia đình An – Hà: dành cho Nguyễn Gia Linh.
2. Thư của ba gửi Gia Linh: dành cho Nguyễn Gia Linh.
3. Tài khoản quản lý tên miền anheritage.example: dành cho Nguyễn Gia Bảo.
4. Hướng dẫn quản lý website gia đình: dành cho Nguyễn Gia Bảo.

Người tin cậy hỗ trợ cung cấp hồ sơ: Trần Thu Hà.

Ghi chú:
Tài liệu này là dữ liệu tổng hợp cho demo LegacyVault. Trong kịch bản sản phẩm, việc bàn giao cần căn cứ Tòa án được Legal thẩm định và phê duyệt.

Cuối trang ghi:
Người lập: Nguyễn Minh An
[Chữ ký minh họa — không phải chữ ký thật]

Bố cục gọn trong một trang, ưu tiên chữ tiếng Việt chính xác.
```

### Prompt 2 — Trích lục khai tử

```text
Tạo ảnh tài liệu hư cấu khổ A4 dọc để demo chức năng upload và xem chứng cứ trong LegacyVault. Giấy trắng, chữ đen rõ, bố cục bảng thông tin, nhìn thẳng, không nghiêng.

Không mô phỏng mẫu hành chính thật. Không quốc huy, không con dấu thật, không mã QR, không chữ ký thật. Watermark rõ:
“MẪU DEMO — KHÔNG CÓ GIÁ TRỊ PHÁP LÝ”.

Tiêu đề:
TRÍCH LỤC KHAI TỬ — BẢN MINH HỌA

Nội dung:
Số tài liệu: DEMO-KT-2026-001
Đơn vị minh họa: Cơ quan hộ tịch Minh Hòa — đơn vị giả định
Họ tên: Nguyễn Minh An
Ngày sinh: 15/03/1980
Ngày mất trong tình huống giả định: 10/10/2026
Ngày lập tài liệu: 12/10/2026
Người cung cấp hồ sơ: Trần Thu Hà
Tham chiếu: DEMO-HS-AN-001/KT

Chân trang:
Tất cả thông tin là dữ liệu giả định phục vụ trình diễn phần mềm. Không dùng cho thủ tục thực tế.

Không thêm số CCCD, địa chỉ thật hoặc thông tin ngoài nội dung trên.
```

### Prompt 3 — Văn bản Tòa án phân chia tài sản

```text
Tạo ảnh tài liệu minh họa hư cấu, một trang A4 dọc, chữ tiếng Việt rõ nét, bảng phân chia tài sản dễ đọc.

Đây là đạo cụ demo phần mềm, không phải quyết định tư pháp thật. Không dùng mẫu tòa án thật, quốc huy, con dấu thật, mã xác thực hoặc chữ ký thật. Watermark lớn:
“MẪU DEMO — KHÔNG CÓ GIÁ TRỊ PHÁP LÝ”.

Tiêu đề:
VĂN BẢN PHÂN CHIA DI SẢN SỐ
QUYẾT ĐỊNH TÒA ÁN — BẢN MINH HỌA

Đơn vị giả định: Tòa án Minh Hòa
Số văn bản: DEMO-TA-2026-015
Ngày ban hành: 18/10/2026
Người để lại di sản trong tình huống giả định: Nguyễn Minh An
Tham chiếu hồ sơ: DEMO-HS-AN-001/TA/V1

Bảng gồm hai cột “Tài sản” và “Người nhận”:
Tài khoản lưu ảnh gia đình An – Hà | Nguyễn Gia Linh
Thư của ba gửi Gia Linh | Nguyễn Gia Linh
Tài khoản quản lý tên miền anheritage.example | Nguyễn Gia Bảo
Hướng dẫn quản lý website gia đình | Nguyễn Gia Bảo

Ghi chú:
Mỗi tài sản trong bảng được phân bổ toàn bộ cho một người nhận.
Tài liệu không hiển thị mật khẩu hoặc nội dung bí mật của tài sản.
Đây là dữ liệu tổng hợp dùng kiểm thử quy trình thẩm định và bàn giao của LegacyVault.

Cuối trang:
[Người lập và chữ ký minh họa]
```

### Prompt 4 — Biên bản ký nhận của Gia Linh

```text
Tạo ảnh biên bản ký nhận hư cấu phục vụ demo LegacyVault, một trang A4 dọc, giấy trắng, chữ rõ.

Không con dấu thật hoặc chữ ký thật. Watermark:
“MẪU DEMO — KHÔNG CÓ GIÁ TRỊ PHÁP LÝ”.

Tiêu đề:
BIÊN BẢN XÁC NHẬN ĐÃ NHẬN TÀI SẢN — MINH HỌA

Số tham chiếu: DEMO-BG-LINH-001
Chủ kho: Nguyễn Minh An
Người nhận: Nguyễn Gia Linh
Nhân viên bàn giao trong tình huống demo: Lê Hoàng Nam
Căn cứ: DEMO-TA-2026-015

Tài sản nhận:
1. Tài khoản lưu ảnh gia đình An – Hà.
2. Thư của ba gửi Gia Linh.

Nội dung:
Người nhận có mặt trực tiếp tại quầy và xác nhận đã nhận các tài sản được liệt kê trong buổi demo.

Thời điểm bàn giao: [Điền tại buổi demo]

Hai ô cuối trang:
Người nhận — chữ ký minh họa
Nhân viên bàn giao — chữ ký minh họa

Không đưa mật khẩu hoặc số giấy tờ định danh vào tài liệu.
```

Tạo biên bản cho Bảo bằng cách thay:

```text
Người nhận: Nguyễn Gia Bảo
Số tham chiếu: DEMO-BG-BAO-001

Tài sản nhận:
1. Tài khoản quản lý tên miền anheritage.example.
2. Hướng dẫn quản lý website gia đình.
```

Hai biên bản là đạo cụ ký nhận tại quầy. Trên hệ thống nhập số tham chiếu tại bước xác nhận; chỉ upload ảnh nếu bản tích hợp cuối có contract hỗ trợ rõ ràng.

### Prompt 5 — Bốn ảnh tài sản

Gửi lần lượt từng yêu cầu:

```text
Tạo ảnh minh họa album ảnh gia đình Việt Nam gồm cha mẹ và hai người con đã trưởng thành, phong cách ảnh ấm áp, bối cảnh phòng khách, nhân vật hư cấu, không dùng người nổi tiếng. Tỷ lệ 4:3, không chữ, không logo. Dùng làm ảnh minh họa tài sản số trong demo LegacyVault.
```

```text
Tạo ảnh minh họa màn hình laptop có website gia đình tối giản, bên cạnh có sổ tay và cây xanh, phong cách ảnh sản phẩm hiện đại, màu xanh navy và kem, tỷ lệ 4:3. Không logo thương hiệu, không thông tin đăng nhập, không cần chữ đọc được.
```

```text
Tạo ảnh minh họa một lá thư viết tay đặt trong phong bì mở trên bàn gỗ sáng, cạnh một bức ảnh cha và con gái là nhân vật hư cấu. Không cần chữ đọc được, không chữ ký thật. Cảm giác riêng tư và ấm áp, tỷ lệ 4:3.
```

```text
Tạo ảnh minh họa sổ tay hướng dẫn quản lý website cạnh laptop và ổ cứng sao lưu, bố cục gọn gàng, tông xanh navy và trắng, ánh sáng tự nhiên, tỷ lệ 4:3. Không logo, không mật khẩu, không mã QR.
```

Sau khi Gemini tạo giấy tờ, kiểm tra lại tên, ngày và phân bổ. Nếu sai chữ, yêu cầu sửa trước khi upload.

## 8. Kịch bản A — Diễn tập với hệ thống hiện tại

Phần Owner là trục demo trước. Kiểm tra lưu thật và tải lại ở mỗi bước; nếu dùng preview/fixture phải nói rõ là mô phỏng. Bảng dưới là hướng dẫn thao tác, không chứng nhận runtime.

| Bước | Thao tác | Lời trình bày | Điều cần quan sát |
|---|---|---|---|
| 1 | Đăng nhập Owner | An bắt đầu xây dựng kho di sản số cho gia đình. | Đúng tên và quyền Owner |
| 2 | Tạo kho theo mục 3 | Kho tập hợp tài sản số và hồ sơ liên quan. | Kho xuất hiện, ACTIVE |
| 3 | Thêm Trần Thu Hà | Người tin cậy hỗ trợ liên hệ và cung cấp hồ sơ. | Thông tin được lưu |
| 4 | Thêm Gia Linh và Gia Bảo | Khai báo người thụ hưởng chưa cấp quyền xem tài sản. | Hai người đúng thông tin |
| 5 | Thêm bốn tài sản | Hệ thống lưu văn bản và thông tin tài khoản. | Đúng loại, tên, mô tả |
| 6 | Thêm ảnh minh họa | Ảnh giúp nhận diện tài sản. | Tải và xem lại được |
| 7 | Xem bí mật bằng mật khẩu Owner | Nội dung nhạy cảm yêu cầu xác thực lại. | Đúng nội dung sau xác thực |
| 8 | Tải GT01 | Bản di chúc được lưu để đối chiếu. | Kết quả lưu và xem lại theo quyền |
| 9 | Cấu hình DMS, ví dụ 30 ngày nếu UI cho phép | Owner chọn nhịp kiểm tra hoạt động. | Chu kỳ và lần kiểm tra tiếp theo |
| 10 | Check-in | Phản hồi hợp lệ cập nhật mốc theo dõi. | Thời gian cập nhật |
| 11 | Đổi VI/EN | Giao diện hỗ trợ hai ngôn ngữ. | Không mất dữ liệu nhập |

Phần mua gói có thể bổ sung theo mục 12 khi VNPay sandbox đã cấu hình và chạy thử thành công.

Phần Staff có thể diễn tập tiếp nhận/xem file khi bản tích hợp chạy được. Nếu còn thiếu danh mục phân bổ hoặc dữ liệu Legal, dừng đúng bước, không trình bày mô phỏng như giao dịch thật.

## 9. Kịch bản B — Demo hoàn chỉnh sau các task cuối

Thời lượng 20–25 phút, chưa tính thanh toán. Chuẩn bị giấy tờ và các tài sản dài trước; chỉ nhập trực tiếp một tài sản khi trình diễn.

### Cảnh 1 — Owner chuẩn bị di sản

Thực hiện phần Owner của kịch bản A trong khoảng 5 phút.

Lời dẫn: “Nguyễn Minh An chuẩn bị di sản số khi còn chủ động quản lý tài khoản. Hai người con đã được khai báo, nhưng chưa có quyền đọc tài sản chỉ nhờ xuất hiện trong danh sách.”

### Cảnh 2 — Chuyển sang hồ sơ quá hạn chuẩn bị trước

Không chờ hết 30 ngày trong buổi demo. Chuẩn bị một hồ sơ trên môi trường thử nghiệm đã đi qua quá hạn và thời gian gia hạn bằng cơ chế diễn tập được nhóm hỗ trợ.

Lời dẫn: “Để không phải chờ theo thời gian thực, tôi chuyển sang hồ sơ đã được chuẩn bị ở mốc hết thời gian gia hạn. DMS chỉ kích hoạt xử lý xác minh, chưa kết luận tử vong và chưa mở tài sản.”

Nếu dùng Owner khác cho hồ sơ chuẩn bị trước, nói rõ đó là hồ sơ tương đương; không giả vờ kho vừa tạo tự chuyển trạng thái.

### Cảnh 3 — Staff nhận và tiếp nhận hồ sơ

1. Đăng nhập Staff.
2. Chọn đúng ca của Nguyễn Minh An và nhận ca.
3. Ghi nhận trích lục khai tử theo mục 6.
4. Lưu bản ghi rồi đính kèm GT02.
5. Mở lại file đã tải.
6. Ghi nhận Trần Thu Hà nộp di chúc giấy.
7. Đính kèm GT03 và mở lại.

Lời dẫn: “Staff ghi nhận tài liệu đã tiếp nhận. Quyết định giấy tờ có đủ cơ sở hay không thuộc Legal.”

### Cảnh 4 — Legal kiểm tra tử vong và đối chiếu di chúc

1. Đăng nhập Legal, chọn đúng hồ sơ.
2. Kiểm tra chứng cứ tử vong và ghi kết luận phù hợp bộ demo.
3. Đối chiếu GT01 và GT03.
4. Ghi nhận khớp vì hai bản cùng nội dung.
5. Chuyển sang căn cứ Tòa án theo luồng đã tích hợp.

Nhận xét mẫu:

```text
Đã kiểm tra tài liệu minh họa và thông tin hồ sơ Nguyễn Minh An. Bản di chúc số lưu trước đó và bản số hóa từ bản giấy tiếp nhận có nội dung tương ứng trong bộ demo.
```

Không dùng di chúc để bỏ qua văn bản Tòa án.

### Cảnh 5 — Staff nộp văn bản Tòa án và nhập phân bổ

1. Đăng nhập Staff, mở hồ sơ căn cứ.
2. Chọn GT04.
3. Nhập cơ quan, số và ngày văn bản.
4. Chọn bốn dòng phân bổ đúng mục 4.
5. Lưu phiên bản.
6. Kiểm tra file và phân bổ đã lưu.
7. Chuyển đúng phiên bản cho Legal.

Lời dẫn: “Staff nhập lại phân bổ theo văn bản, không tự quyết định ai được hưởng.”

### Cảnh 6 — Legal thẩm định, duyệt rồi mở khóa riêng

1. Kiểm tra văn bản Tòa án.
2. Kiểm tra đúng hai người nhận và bốn tài sản.
3. Ghi kết luận thẩm định.
4. Hoàn thành review.
5. Phê duyệt cuối.
6. Thực hiện controlled unlock bằng thao tác riêng.

Lý do mẫu:

```text
Trong tình huống demo, văn bản DEMO-TA-2026-015 áp dụng cho hồ sơ Nguyễn Minh An. Phân bổ trên hệ thống khớp bốn tài sản và hai người nhận được liệt kê trong văn bản minh họa.
```

Lời dẫn: “Phê duyệt và mở khóa là hai bước riêng. Việc tải giấy tờ lên không tự mở tài sản.”

### Cảnh 7 — Gia Linh có mặt tại quầy

1. Staff mở phiên bàn giao.
2. Người đóng vai Gia Linh có mặt trực tiếp.
3. Staff đối chiếu danh tính ngoài hệ thống, ghi nhận trách nhiệm theo luồng BE đã chốt.
4. Liên kết hoặc tạo tài khoản Gia Linh nếu demo xem tài sản.
5. Dùng mã mời do hệ thống cấp nếu luồng cuối sử dụng mã.
6. Trước khi giao, mở tài khoản Gia Linh để thể hiện chưa đọc được tài sản chưa bàn giao.

Không đặt trước mã mời, dùng mã hệ thống sinh. Không giả kết quả xác minh để vượt guard. Người nhận offline vẫn được xử lý trực tiếp theo contract, không ép tạo account; bộ demo này dùng account để trình bày quyền đọc.

### Cảnh 8 — Bàn giao từng phần cho Gia Linh

1. Chọn TS-01 và giao.
2. Đăng nhập Gia Linh: kiểm tra TS-01 đã giao được đọc.
3. Kiểm tra TS-03 chưa giao chưa đọc được.
4. Quay lại Staff và giao TS-03.
5. Ghi nhận ký nhận trực tiếp với số tham chiếu dưới đây.
6. Tải lại tiến độ.

```text
Tham chiếu ký nhận: DEMO-BG-LINH-001
```

Điểm cần thể hiện: tài khoản liên kết đúng vẫn chỉ đọc phần thực sự được giao.

### Cảnh 9 — Bàn giao cho Gia Bảo

1. Bảo có mặt trực tiếp.
2. Staff đối chiếu theo quy trình và liên kết tài khoản nếu cần.
3. Giao TS-02 và TS-04.
4. Ghi nhận số tham chiếu dưới đây.
5. Đăng nhập Bảo, kiểm tra chỉ thấy tài sản của Bảo.

```text
Tham chiếu ký nhận: DEMO-BG-BAO-001
```

Lời dẫn: “Hai người nhận cùng một hồ sơ nhưng quyền truy cập tách theo tài sản đã bàn giao cho từng người.”

### Cảnh 10 — Đóng phiên và lưu trữ

Thực hiện đúng thứ tự:

1. Kiểm tra đủ bàn giao tài sản.
2. Kiểm tra đủ xác nhận người nhận.
3. Đóng phiên.
4. Tạo Staff receipt theo phạm vi hệ thống cho phép.
5. Lưu trữ kho và đóng ca.
6. Xem lại lịch sử.
7. Đăng nhập Linh hoặc Bảo: vẫn đọc được phần đã nhận sau archive.

Kỳ vọng sau khi hoàn tất:

```text
Tài sản hoàn tất: 4/4
Người nhận đã xác nhận: 2/2
Phiên bàn giao: Đã hoàn tất
Ca: Đã đóng
Kho: Đã lưu trữ
```

Staff receipt sau đóng phiên là ghi nhận Staff, không phải chữ ký số người thụ hưởng.

## 10. Ba tình huống chặn nên trình diễn

Dùng hồ sơ phụ hoặc diễn tập trước khi hoàn tất hồ sơ chính.

### Thiếu văn bản Tòa án

Thử tiếp tục khi thiếu căn cứ. Lời dẫn: “Có di chúc và giấy tờ tử vong vẫn chưa đủ để mở khóa theo phạm vi hiện tại.” Kỳ vọng chặn hoặc yêu cầu bổ sung/ON_HOLD đúng luồng.

### Đã giao nhưng chưa đủ xác nhận

Sau khi giao đủ bốn tài sản nhưng mới một người xác nhận, thử đóng phiên. Kỳ vọng chặn vì hai điều kiện hoàn tất chưa cùng đạt.

### Truy cập tài sản người khác

Đăng nhập Linh, kiểm tra không đọc TS-02/TS-04 của Bảo. Kỳ vọng chỉ thấy/đọc phạm vi hợp lệ của mình.

Không sửa cơ sở dữ liệu để tạo lỗi trong buổi trình diễn.

## 11. Checklist chuẩn bị

- [ ] Owner, Staff, Legal và hai người nhận đúng quyền.
- [ ] Phân biệt hồ sơ ACTIVE với hồ sơ quá hạn chuẩn bị trước.
- [ ] Bốn tài sản đúng tên/nội dung, bốn ảnh minh họa.
- [ ] Di chúc, trích lục khai tử và văn bản Tòa án đầy đủ.
- [ ] Hai bản di chúc đối chiếu khớp nhau.
- [ ] Văn bản Tòa án khớp bốn dòng phân bổ.
- [ ] Hai tham chiếu DEMO-BG-LINH-001, DEMO-BG-BAO-001.
- [ ] File mở được, chữ đọc được, đúng MIME/dung lượng.
- [ ] Lưu thật được kiểm tra bằng tải lại màn hình.
- [ ] Chạy thử ít nhất một lượt tiếp nhận → archive trên bản tích hợp cuối.
- [ ] Phiên trình duyệt riêng cho từng vai trò.
- [ ] Mã mời, UUID, hash, thời gian hệ thống để hệ thống sinh.
- [ ] Kiểm tra quyền người nhận sau archive.
- [ ] Nếu demo thanh toán: hoàn tất checklist mục 12, không dùng giao dịch mock để nói cổng đã thanh toán.

Lời kết: “LegacyVault kết nối việc chuẩn bị di sản số với quy trình tiếp nhận, thẩm định và bàn giao có kiểm soát. Người nhận chỉ truy cập đúng phần đã được duyệt và thực sự bàn giao; lịch sử vẫn được giữ lại sau khi hồ sơ hoàn tất.”

## 12. Bổ sung — Demo mua và nâng cấp gói qua VNPay sandbox

### Kết luận đã đối chiếu khi lưu tài liệu

Code hiện tại có FE chọn gói/xác nhận/chuyển VNPay và BE tạo/đọc giao dịch/xác thực IPN. Hoàn thành các task Staff không tự cấu hình merchant, callback hoặc bật live payment.

| Thao tác | Phạm vi code hiện tại |
|---|---|
| BASIC → STANDARD | Hỗ trợ qua VNPay sandbox khi cấu hình sẵn sàng |
| BASIC → EXTENDED | Tương tự |
| STANDARD → EXTENDED | Hỗ trợ; trả đủ giá gói đích |
| Mua lại cùng gói hoặc hạ gói | Bị chặn |
| Thu tiền thật | Chưa có chế độ live trong bản này |
| Tự động gia hạn/hoàn tiền | Không có trong bản sandbox này |

Giá mặc định theo contract ngày 20/10/2026: BASIC miễn phí; STANDARD 499.000đ; EXTENDED 999.000đ; dùng trọn đời. STANDARD → EXTENDED trả đủ 999.000đ, không trừ 499.000đ trước đó. Nếu Admin xuất bản catalog mới, dùng giá/version do backend trả tại thời điểm demo.

**Lệch tài liệu cần biết:** Jira PS-80 được đọc trực tiếp ngày 21/10/2026 ở trạng thái Done nhưng tiêu đề/mô tả còn chính sách theo tháng ngày 17/10/2026. Code và `payments-vnpay.md` đang thể hiện chính sách trọn đời ngày 20/10/2026. Tài liệu này phản ánh code/contract hiện tại, không coi Jira đã được đồng bộ. Không tự sửa Jira trong tác vụ lưu kịch bản.

### Điều kiện trước khi diễn tập thanh toán

- Có merchant VNPay sandbox hợp lệ.
- Backend có VNPAY_SANDBOX_ENABLED, VNPAY_TMN_CODE, VNPAY_HASH_SECRET, VNPAY_RETURN_URL cấu hình ngoài Git; không lưu giá trị secret trong tài liệu này.
- IPN được đăng ký tới HTTPS backend có thể nhận callback từ cổng. Backend chỉ ở localhost không đủ để nhận IPN từ VNPay.
- Migration được áp dụng đúng thứ tự trên môi trường demo; không sửa checksum/reset DB.
- Đã chạy thử FE → BE → VNPay sandbox → IPN → SQL Server và ghi nhận gói thực sự đổi.
- Dùng thông tin thanh toán thử do VNPay sandbox cung cấp cho môi trường đó, không tự bịa số thẻ/OTP hoặc dùng thẻ thật.

Các điều kiện trên chưa được kiểm tra runtime trong tác vụ viết tài liệu. Contract ghi chưa có merchant và chưa có bằng chứng VNPay E2E tại mốc biên soạn contract; cần xác minh lại trước demo.

### Kịch bản bổ sung khoảng 3–5 phút

1. Dùng Owner demo riêng đang BASIC để không ảnh hưởng hồ sơ bàn giao chính.
2. Mở Gói sử dụng, đọc gói hiện hành và catalog thật.
3. Chọn STANDARD; kiểm tra báo giá backend.
4. Xác nhận và chuyển sang VNPay sandbox.
5. Thanh toán bằng dữ liệu thử của cổng.
6. Quay lại LegacyVault; chờ backend xác minh IPN. Return URL đơn thuần không cấp gói.
7. Khi backend báo SUCCEEDED, kiểm tra STANDARD và hạn mức đã đổi; tải lại trang để xác minh lưu thật.
8. Nếu cần minh họa nâng cấp: chọn EXTENDED, chỉ rõ trả đủ giá gói đích rồi lặp lại luồng sandbox.
9. Nếu PENDING/FAILED/hủy: kiểm tra không tự cấp gói. Không sửa DB hoặc giả callback thành công để trình bày là đã thanh toán qua cổng.

Lời dẫn: “Đây là thanh toán thử VNPay sandbox. Chỉ khi backend xác minh kết quả từ cổng, hệ thống mới ghi nhận gói đã mua. Bản demo này không thu tiền thật.”

Nếu sandbox chưa cấu hình: giới thiệu khả năng đã có trong code và ghi rõ bước chờ môi trường; không khẳng định mua/nâng cấp đã chạy thành công.

## 13. Nguồn đối chiếu

- [README](../README.md), [Project context](PROJECT_CONTEXT.md), [Decisions](DECISIONS.md).
- [Asset contract](api-contracts/assets.md), [Vault contract](api-contracts/vaults.md), [DMS](api-contracts/dms.md).
- [Staff verification](api-contracts/staff-verification.md), [Legal basis](api-contracts/legal-basis-dossier.md), [Court route](api-contracts/court-route.md).
- [Handover deliveries](api-contracts/handover-deliveries.md), [Completion](api-contracts/handover-completion.md), [Receipts](api-contracts/handover-receipts.md).
- [VNPay sandbox](api-contracts/payments-vnpay.md), [Lifetime plans and images](api-contracts/lifetime-plans-and-asset-images.md).
- Source: frontend/src/pages/subscription/PaymentCheckout.jsx; backend/src/main/java/com/legacyvault/subscription/service/PaymentService.java và SubscriptionUpgradeService.java.
- Jira: [PS-80](https://thaithai9785.atlassian.net/browse/PS-80), [PS-95](https://thaithai9785.atlassian.net/browse/PS-95), [PS-96](https://thaithai9785.atlassian.net/browse/PS-96), [PS-97](https://thaithai9785.atlassian.net/browse/PS-97), [PS-98](https://thaithai9785.atlassian.net/browse/PS-98), [PS-102](https://thaithai9785.atlassian.net/browse/PS-102), [PS-103](https://thaithai9785.atlassian.net/browse/PS-103).

Một số contract cũ còn mô tả NOTARIAL/màn xác minh danh tính hoặc giới hạn trước tích hợp; dùng quyết định mới và contract thực tế đã thống nhất khi diễn tập, không dùng đoạn lịch sử để bypass guard.
