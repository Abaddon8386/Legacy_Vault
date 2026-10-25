# FE account tại quầy, Shared with me và Grace

## Hành vi

- Người nhận dùng account cá nhân, vào Shared with me để gửi mã hồ sơ, xem/hủy yêu cầu và cập nhật quyền sau Staff-confirm. Pending không cấp quyền đọc tài sản. Phần đã giao tiếp tục dùng API đọc hiện có.
- Staff chọn account từ yêu cầu và recipient của hồ sơ, đối chiếu tại quầy rồi xác nhận/từ chối. Create-only không tự attach; response sai case/account/trạng thái bị từ chối. Giữ tương thích component cũ cho caller cũ.
- Grace hiển thị Ngày/Giờ/Phút; adapter theo phút giữ đúng tổng phút, adapter ngày không làm tròn ngầm. Giữ nháp/khóa ghi cạnh tranh. Cancel Alert nối API có sẵn theo DMS/Vault đúng trạng thái.
- Modal tài sản giữ footer Lưu/Hủy ngoài vùng cuộn, upload VI/EN/tên/dung lượng; profile xuống dòng. Bene/Staff dùng nền chuyển động và kiểu chữ chung, hỗ trợ giảm chuyển động.

## Tích hợp và giới hạn

`main.jsx` truyền caseLinkActions=null và counterLinkActions=null để bật UI mới nhưng khóa chức năng API chưa có; không dựng pending/thành công giả. App nhận các adapter caseLinkActions/counterLinkActions/dmsGraceActions; chúng là cổng FE, chưa phải HTTP contract BE. Min/max/default Grace cần chốt với BE; 0–30 ngày trong review chỉ là fixture.

BE cần create-only, request theo mã hồ sơ, Staff-confirm nguyên tử, lưu Grace theo phút và metadata recipient C từ văn bản. Không tuyên bố toàn luồng thật đã hoàn thành. Không đổi BE hoặc rule quyền. Trang `frontend/review/thai-workflow.html` chỉ DEV, dữ liệu bộ nhớ, không import vào production entry.

## Validation

- Nhánh từ develop `009f7556a8d7edd7ab13aad15b86b0af75caa6b9` đã gồm nền UI #208.
- CaseLinkWorkflow và Shared App integration: 43/43. Các bộ DMS/LiveHandover/asset liên quan đã đạt ở checkout tích hợp 5196; không chạy full suite trong lần đóng gói PR.
- ESLint file liên quan, production build và diff-check đạt. Build còn cảnh báo bundle >500 kB.
- UI đã kiểm tra bằng fixture trên desktop/mobile trước đó; chưa nghiệm thu BE/SQL toàn luồng mới. Không coi ảnh fixture là bằng chứng giao tài sản thật.
