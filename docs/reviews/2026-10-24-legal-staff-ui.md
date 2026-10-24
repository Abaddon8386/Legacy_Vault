# Legal — đồng bộ giao diện với Staff

## Cơ sở và phạm vi

- Nhánh `feat/legal-staff-ui-alignment`, tách từ develop sau PR #203.
- Đã mở hai trang thực tế `/staff/cases` và `/legal/dossier-review?lang=vi`, đăng nhập bằng tài khoản của từng vai trò, xem danh sách và hồ sơ có dữ liệu backend.
- Lấy bố cục Staff làm mẫu: thanh công cụ gọn, hồ sơ nền xanh, thẻ giấy tờ và khu vực thao tác có phân cấp rõ ràng. Giữ sidebar và font không chân theo yêu cầu trước đó.
- Chỉ sửa phần trình bày Legal. Không thay endpoint, payload, điều kiện phê duyệt/mở khóa, trạng thái hồ sơ hay dữ liệu ứng dụng.

## Hướng thiết kế

- Màu theo Staff: chữ `#203e33`, nền trắng `#ffffff`, nút chính `#244b3d`, nhấn vàng `#c5a059`, chữ phụ `#67776f`, viền `#e2e5dc`. Nền trang và sidebar hiện có được giữ nguyên.
- Chữ dùng `--lv-font-sans`; tiêu đề trang 26–34px, tiêu đề thẻ 19px, nội dung 14px. Nhãn và giá trị có độ đậm khác nhau.
- Các vùng dùng chung mép căn, khoảng cách 20px giữa nhóm và 8–12px trong nhóm. Thẻ giấy tờ dùng nhấn xanh xám, thẻ quyết định dùng nhấn vàng như Staff.
- Không thêm animation hoặc thông tin trang trí. Bỏ hẳn sơ đồ 6 bước và hướng dẫn quy trình thường trực. Điều kiện còn thiếu, trạng thái chỉ đọc và lỗi tải vẫn hiển thị tại đúng vùng liên quan.

```text
Tiêu đề chức năng
Chọn hồ sơ                              Tải lại danh sách
Hồ sơ đang xem + trạng thái từ backend
Giấy tờ / kết luận đã lưu                Ghi nhận quyết định
```

Ở màn hẹp, giấy tờ đứng trước biểu mẫu theo đúng thứ tự DOM. Khi hồ sơ chỉ đọc, khu vực quyết định không xuất hiện.

## Các điểm đã sửa

| Mức độ | Vị trí | Trước | Sau | Lý do |
| --- | --- | --- | --- | --- |
| Medium | `frontend/src/pages/legal/LegalLiveWorkflow.jsx` | Sơ đồ 6 bước lặp lại sidebar, mô tả và lưu ý quy trình chiếm phần đầu trang | Bỏ cả sơ đồ desktop/mobile và hướng dẫn thường trực | Đưa công việc chính lên đầu, giảm điều hướng lặp |
| Medium | `frontend/src/pages/legal/LegalLiveWorkflow.css` | Khung chọn hồ sơ lớn, biểu mẫu nối dài cùng giấy tờ | Thanh công cụ gọn; thẻ hồ sơ xanh; giấy tờ và thao tác tách vùng, hai cột khi đủ chỗ | Grouping, shared edges và một hành động chính rõ ràng |
| Medium | `frontend/src/pages/legal/LegalFinalDecision.jsx` | Điều kiện, thông tin và biểu mẫu nối tiếp; hướng dẫn điều kiện bị lặp | Thông tin bên giấy tờ, điều kiện và nút ở vùng quyết định; bỏ thông báo hướng dẫn trùng | Người xử lý biết nút nào tác động và vì sao đang bị khóa |
| Medium | `frontend/src/pages/legal/LegalEvidenceFiles.jsx` | Tên tệp, ngày và nút rời nhau | Một hàng tệp gồm biểu tượng, tên/ngày và nút có biểu tượng mắt | Grouping và phân biệt điều khiển với nội dung |
| Low | `frontend/src/pages/legal/LegalLiveWorkflow.jsx` | Lỗi tải tài liệu có thể dùng thông báo giống lỗi lưu quyết định | Phân biệt thông báo lỗi đọc tài liệu và lỗi thao tác | Giúp người dùng chọn đúng thao tác thử lại |

## Kiểm tra

- Kiểm thử liên quan: 102/102 đạt, gồm Legal và tích hợp điều hướng Staff. Giữ kiểm tra phân quyền, phản hồi chậm, đổi hồ sơ, chỉ đọc, mở/đóng tệp và payload quyết định hiện có.
- ESLint đạt; production build đạt; diff-check đạt. Build còn cảnh báo kích thước bundle lớn.
- Browser: mở sáu màn Legal; đổi hồ sơ và VI/EN; xem hồ sơ đang chờ và hồ sơ đã chuyển bàn giao; mở PDF trong popup, Escape đóng và trả focus về nút xem tệp.
- Bố cục desktop mặc định và mobile 390px/320px; kiểm tra biên thẻ, form và độ rộng tài liệu. Hai cột tự chuyển thành một cột theo độ rộng vùng làm việc; không tràn ngang ở các ca đã xem.
- Không gửi quyết định Legal, mở khóa, nhận hồ sơ Staff hoặc thay dữ liệu khi kiểm tra UI.
- Not verified: zoom trình duyệt 200%, RTL, mọi kích thước/locale ngoài các ca nêu trên. Quy trình nghiệp vụ có thao tác ghi chưa được demo lại trên DB.

## Bổ sung: nút tải lại

- Bỏ nút tải lại thường trực ở header Legal, danh sách và hồ sơ; người dùng có thể dùng F5 khi cần tải lại toàn trang.
- Giữ hành động theo ngữ cảnh: `Thử lại` khi tải/lưu lỗi hoặc dữ liệu cần xác minh lại; `Xem trạng thái mới` sau khi server xác nhận quyết định. Các hành động này dùng lại cơ chế GET hiện có, không gửi lại quyết định và không làm mất bản nháp do tải toàn trang.
- Giữ nguyên nút refresh của Staff/Owner và kiểm tra thu hồi quyền khi phiên thay đổi.
- Kiểm tra bổ sung: 80/80 test liên quan đạt, lint/build đạt; browser xác nhận ca bình thường không có ba nút tải lại, ca tải lỗi có nút `Thử lại`.

## Sửa hồi quy PR #204: trạng thái hồ sơ sau khi lưu

- Trước sửa, `Xem trạng thái mới` chỉ tải lại dữ liệu của giấy tờ; nhãn trạng thái dùng context cha nên vẫn giữ giá trị trước quyết định.
- Cả `Xem trạng thái mới` và `Thử lại` nay tải lại context hồ sơ trước, rồi nạp lại giấy tờ. Trong lúc xác minh lại, ẩn trạng thái cũ và unmount dữ liệu/thao tác cũ.
- Giữ bản nháp và lựa chọn giấy tờ trong đúng phạm vi hồ sơ/bước/phiên; lựa chọn giấy tờ được kiểm tra lại theo danh sách context mới. Đổi hồ sơ, bước hoặc tài khoản vẫn xóa bản nháp như trước.
- Ba kiểm thử mới tái hiện lỗi trên bản cũ, sau sửa đều đạt: đồng bộ trạng thái cha/giấy tờ sau quyết định; lỗi context 403 và 500 không giữ trạng thái hoặc biểu mẫu cũ. Tổng kiểm thử liên quan đạt 83/83; lint/build đạt.

Approve cho phạm vi giao diện đã kiểm tra.
