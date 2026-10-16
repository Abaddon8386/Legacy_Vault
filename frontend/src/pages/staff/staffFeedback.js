import { useCallback, useRef } from 'react';

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

// Notify once per authenticated token; preview errors must not sign out a real session.
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
