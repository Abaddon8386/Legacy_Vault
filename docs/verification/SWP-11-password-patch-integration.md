# SWP-11 / PR #141 — mật khẩu trong PATCH sửa tài sản

Ngày: 2026-10-21. Nền: develop `4579d7f` (đã merge Legal #177).

- Theo contract PS-111 do nhóm BE bàn giao: `PATCH /api/v1/vaults/{vaultId}/assets/{assetId}` gửi `{ ...editableFields, password }`. Không có bước verifyPassword riêng, không gọi reveal/login thay thế.
- Modal truyền mật khẩu hiện tại cùng patch qua AssetManagementPage; service giữ whitelist name/description/payload và password. Giữ nguyên khoảng trắng có ý nghĩa trong password/payload; password không được lưu vào metadata, storage hoặc log.
- Phải có ít nhất một trường chỉnh sửa và mật khẩu không trống, tối đa 72 ký tự. Không đổi assetType/vaultId/role hoặc tự cấp quyền.
- `403 REAUTH_FAILED` giữ form/bản nháp; `429 TOO_MANY_ATTEMPTS` hiển thị thông báo thử lại sau. Không đánh đồng hai lỗi này với hết phiên hoặc ACCESS_DENIED. Mỗi lần gửi xóa ô mật khẩu; retry cần nhập lại.
- Chống gửi trùng, chuyển AbortSignal từ modal tới request; đổi context/đóng màn bỏ phản hồi cũ. Chỉ receipt hợp lệ mới đóng form, reload metadata và báo lưu thành công.

## Kiểm tra

- 16 test liên quan: contract PATCH, whitelist, mật khẩu bắt buộc, phân biệt lỗi, hủy request, CREDENTIAL và luồng AssetManagementPage thật.
- Full FE: 1.055/1.055 đạt; lint/build/diff check đạt. Build còn cảnh báo bundle lớn hiện hữu.
- Test HTTP dùng fixture cô lập, không có mock runtime trong ứng dụng; chưa kiểm thử BE PS-111/SQL thật.

## Phối hợp merge

Tại thời điểm kiểm tra chưa tìm thấy nhánh/PR PS-111 trên origin; contract được lấy từ báo cáo BE do người dùng cung cấp. PR #141 sẵn sàng cho review phối hợp. FE trên develop cũ chưa gửi password sẽ lỗi 400 khi BE mới bắt buộc password; cần đồng bộ #141 và PS-111 theo kế hoạch nhóm. Không tuyên bố mật khẩu đã được server xác thực khi PS-111 chưa triển khai, không tự merge hoặc chỉnh BE.
