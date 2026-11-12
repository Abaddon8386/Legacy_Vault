/**
 * staffFeedback.js - Tiện ích chung cho các trang Staff: chuyển lỗi xác thực/phân quyền thành thông báo và báo hết phiên đăng nhập.
 * Được dùng bởi StaffCaseDashboard, StaffCaseIntakePage, StaffCaseVerificationPage, LiveHandoverPage và LegacyCounterBeneficiariesSection.
 */
import { useCallback, useRef } from 'react';

/**
 * Chuyển lỗi API thành nội dung thông báo cho người dùng khi phiên hết hạn hoặc bị từ chối quyền.
 *
 * 401 hoặc code UNAUTHENTICATED/UNAUTHORIZED -> "Phiên làm việc đã hết hạn"; 403 hoặc code ACCESS_DENIED/FORBIDDEN -> "Không có quyền truy cập".
 * @param {Object} error Lỗi (thường là ApiError) có status và code.
 * @param {string} [lang='vi'] 'vi' hoặc 'en'.
 * @returns {{title: string, description: string} | null} Thông báo, hoặc null nếu lỗi không thuộc hai nhóm trên.
 */
export function staffAuthFeedback(error, lang = 'vi') {
  const expired = error?.status === 401 || ['UNAUTHENTICATED', 'UNAUTHORIZED'].includes(error?.code);
  const forbidden = error?.status === 403 || ['ACCESS_DENIED', 'FORBIDDEN'].includes(error?.code);
  if (!expired && !forbidden) return null;
  const en = lang === 'en';
  return expired
    ? { title: en ? 'Session expired' : 'Phiên làm việc đã hết hạn',
      description: en ? 'Please sign in again to continue.' : 'Vui lòng đăng nhập lại để tiếp tục.' }
    : { title: en ? 'Access denied' : 'Không có quyền truy cập',
      description: en ? 'Your account cannot perform this action.' : 'Tài khoản của bạn không có quyền thực hiện thao tác này.' };
}

/**
 * Hook trả về hàm xử lý lỗi: khi gặp lỗi hết phiên (401 / UNAUTHENTICATED / UNAUTHORIZED) thì gọi onUnauthorized đúng một lần cho mỗi accessToken.
 * Lỗi ở chế độ dev preview không có token thật sẽ không làm đăng xuất phiên thật. Dùng useRef để nhớ token đã báo và useCallback để giữ hàm ổn định.
 * @param {{accessToken: string, isDevPreview: boolean, onUnauthorized: Function}} params Token hiện tại, cờ dev preview và callback đăng xuất.
 * @returns {(error: Object) => void} Hàm nhận lỗi API và quyết định có gọi onUnauthorized hay không.
 */
export function useStaffSessionExpiry({ accessToken, isDevPreview, onUnauthorized }) {
  const notified = useRef(undefined);
  return useCallback(error => {
    const expired = error?.status === 401 || ['UNAUTHENTICATED', 'UNAUTHORIZED'].includes(error?.code);
    if (expired && (!isDevPreview || accessToken) && onUnauthorized && notified.current !== accessToken) {
      notified.current = accessToken;
      onUnauthorized();
    }
  }, [accessToken, isDevPreview, onUnauthorized]);
}
