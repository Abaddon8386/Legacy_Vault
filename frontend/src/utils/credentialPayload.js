// The backend encrypts payload as opaque text; the API shape stays unchanged.
/**
 * Đóng gói tên đăng nhập và mật khẩu của tài sản dạng tài khoản thành chuỗi JSON {username,password} để gửi trong trường payload; backend mã hóa payload như văn bản mờ. Trả chuỗi rỗng nếu cả hai đều trống. Dùng bởi components/assets/AssetFormModal.jsx và AssetEditModal.jsx.
 */
export function credentialPayload(username = '', password = '') {
  if (!username.trim() && !password) return '';
  return JSON.stringify({ username: username.trim(), password });
}
