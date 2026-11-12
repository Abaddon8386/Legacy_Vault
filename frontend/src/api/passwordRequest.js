import { ApiError, request } from './http.js';
import { withFirstPassword } from '../utils/passwordSetupFlow.js';

/**
 * Gửi yêu cầu JSON có kèm mật khẩu xác nhận (ví dụ {@code PATCH /vaults/{id}/assets/{id}}, {@code POST .../reveal}).
 * Bọc {@link request} bằng {@code withFirstPassword} ({@code utils/passwordSetupFlow.js}): nếu backend trả {@code PASSWORD_NOT_SET}
 * (tài khoản Google chưa có mật khẩu) thì luồng thiết lập mật khẩu lần đầu được mở, sau đó yêu cầu được gửi lại với mật khẩu mới.
 * @param {string} path Đường dẫn API.
 * @param {object} options Tùy chọn của {@link request}; {@code options.body} bắt buộc có trường mật khẩu.
 * @param {string} [field='password'] Tên trường chứa mật khẩu trong body.
 * @returns {Promise<*>} Dữ liệu JSON phản hồi.
 */
export function passwordRequest(path, options, field = 'password') {
  return withFirstPassword(password => request(path, { ...options, body: { ...options.body, [field]: password } }), options.body[field], options);
}

// Binary responses use the same setup flow, without replacing the application's fetch function.
/**
 * Phiên bản dùng {@code fetch} trực tiếp cho phản hồi nhị phân (tải tệp/ảnh tài sản qua {@code POST .../download}) nhưng vẫn đi qua
 * luồng thiết lập mật khẩu lần đầu. Body của {@code init} phải là JSON chứa {@code password}; nếu phản hồi là 403 với mã
 * {@code PASSWORD_NOT_SET} thì ném {@link ApiError} để {@code withFirstPassword} xử lý.
 * @param {string} url URL đầy đủ.
 * @param {RequestInit} init Tham số fetch (body là chuỗi JSON).
 * @param {{fetchFn?:Function}} [options] Tùy chọn, có thể thay hàm fetch.
 * @returns {Promise<Response>} Phản hồi thô.
 */
export function passwordFetch(url, init, options = {}) {
  const originalBody = JSON.parse(init.body);
  return withFirstPassword(async password => {
    const response = await (options.fetchFn || globalThis.fetch)(url, { ...init, body: JSON.stringify({ ...originalBody, password }) });
    if (response.status === 403) {
      const error = await response.clone().json().catch(() => null);
      if (error?.code === 'PASSWORD_NOT_SET') throw new ApiError('PASSWORD_NOT_SET', 403);
    }
    return response;
  }, originalBody.password, options);
}
