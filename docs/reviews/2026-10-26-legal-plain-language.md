# Legal — ngôn ngữ dành cho chuyên viên

Ngày 26/10/2026. Theo yêu cầu bỏ các thuật ngữ kỹ thuật thừa trên giao diện Legal.

## Nền code đã cập nhật

- Đã xác nhận PR #214 được merge tại `193483ed6f13c28e7aad55827628c8368b120d15`.
- Đã fetch `origin/develop` và đồng bộ nguồn mới tại `150c850d13c50ba51a90ba39feece6a56dc8754b`: 86 tệp, gồm phần liên kết tài khoản, hướng dẫn quy trình và các thay đổi Legal mới từ nhóm.
- Trước khi ghi từng tệp, đối chiếu nội dung local với mốc trước và lưu bản sao. Không có xung đột. Không reset hoặc xóa các thay đổi local; Git HEAD local chưa được chuyển trong lượt đồng bộ này.
- PR chỉ mang phần chỉnh Legal và hướng dẫn Legal sau mốc trên; không đưa lại các thay đổi BE/Staff/Beneficiary vừa tiếp nhận.

## Nội dung thay đổi

Người sử dụng là chuyên viên thẩm định, không cần thao tác với mã của hệ thống. Giữ shell, font, màu và bố cục hiện có; giảm nội dung thừa bằng cách bỏ hẳn các khối kỹ thuật thay vì đổi tên các giá trị đó thành dữ liệu nghiệp vụ.

| Trước | Sau |
|---|---|
| Các khối “Chi tiết kỹ thuật”, UUID tài sản/người nhận, mã kiểm tra giấy tờ/phân chia, tham chiếu nội bộ | Không hiển thị trên màn Legal; giữ tên, số hồ sơ/số văn bản và nội dung cần thẩm định |
| “Đối chiếu… phiên bản và mã băm SHA-256” | “Đối chiếu nội dung di chúc bản giấy với bản đã lưu” |
| “Backend/API/endpoint chưa sẵn sàng”, HTTP 403 hoặc lỗi nguyên văn | Nêu việc chưa thực hiện được, quyền truy cập cần có hoặc hướng dẫn tải lại/thử lại |
| Thông báo chưa nhận diện lý do từ máy chủ | Hướng dẫn tải lại hồ sơ hoặc liên hệ người phụ trách; không tự kết luận thiếu giấy tờ |
| “Nguồn người nhận” | “Căn cứ xác định người nhận” |

Áp dụng trên luồng Legal thật, các màn xem trước cũ và nội dung hướng dẫn Legal mới từ nhóm. Thông tin văn bản, phiên bản tài liệu, người nhận từ Tòa án, lịch sử và xác nhận hệ quả quyết định vẫn còn để chuyên viên đối chiếu.

Các trường kỹ thuật vẫn được dùng bên trong dịch vụ: kiểm tệp, đối chiếu thay đổi và gửi đúng thông tin khi lưu. Không sửa API, điều kiện phê duyệt, quyền truy cập hoặc thứ tự phê duyệt → mở khóa. Không hiển thị một badge “đã xác thực” chỉ vì hồ sơ có mã kiểm tra.

## Kiểm tra

- **252/252** test đạt, gồm toàn bộ `legal*.test.mjs`, workflow guidance, shared UI và case-link service/workflow.
- Component VI/EN xác nhận tên tài sản, người nhận, văn bản và quyết định vẫn hiển thị; UUID/hash/tham chiếu nội bộ không nằm trong nội dung trang. Các test vẫn kiểm đúng payload phê duyệt và guard khi giấy tờ/phân chia/tranh chấp đổi.
- Test tệp vẫn kiểm đường dẫn đọc được cấp quyền, MIME/size/hash, hủy request và thu hồi Blob URL; bỏ việc hiển thị evidence reference không làm thay đổi đường đọc tệp.
- ESLint toàn bộ thư mục Legal và `workflowGuidance.js` đạt. Production build đạt; vẫn có cảnh báo bundle lớn hơn 500 kB của ứng dụng.
- Lượt này không nghiệm thu trực quan trên hồ sơ thật hoặc thực hiện quyết định pháp lý thật. Các giới hạn backend/SQL và nghiệm thu trực quan của các báo cáo trước không được coi là đã giải quyết bằng test FE.

Lệnh kiểm tra từ `frontend`:

```powershell
$legalTestFiles = @(Get-ChildItem src/utils/legal*.test.mjs | ForEach-Object { $_.FullName })
node --max-old-space-size=512 --test --test-concurrency=1 $legalTestFiles src/utils/workflowGuidance.test.mjs src/utils/sharedUiComponent.test.mjs src/utils/caseLinkService.test.mjs src/utils/caseLinkWorkflow.test.mjs
node node_modules/eslint/bin/eslint.js src/pages/legal src/utils/workflowGuidance.js
npm.cmd run build
```
