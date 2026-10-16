import { isSessionActive } from './session.js';
import { legalI18n } from '../pages/legal/legalI18n.js';

/**
 * PS-29: Legal Will Document Verification (ST-15) - Quy tắc LV-WILL-001
 *
 * Chỉ kiểm tra các ràng buộc thực tế theo AC:
 * - Lựa chọn kết quả đối chiếu: MATCH ('Khớp') hoặc MISMATCH ('Không khớp')
 * - Không tự ý thêm chữ ký, lý do bắt buộc hay ràng buộc ngoài hợp đồng
 * - Kết quả đối chiếu không tự động chuyển thành Legal Approved
 */

export const VERIFICATION_COMPARISON_CHOICES = Object.freeze([
  'MATCH',
  'MISMATCH',
]);

export const VERIFICATION_ERROR_KEYS = Object.freeze({
  COMPARISON_REQUIRED: 'comparisonRequired',
  COMPARISON_INVALID: 'comparisonInvalid',
});

/**
 * Hàm kiểm tra quyền truy cập route Legal Will Document Verification dùng thật trong ứng dụng
 * Yêu cầu: phiên còn hiệu lực và người dùng có role LEGAL_VERIFIER
 */
export function canAccessLegalWillVerification(session) {
  if (!isSessionActive(session)) {
    return false;
  }
  return Boolean(session?.user?.roles?.includes('LEGAL_VERIFIER'));
}

/**
 * Kiểm tra tính đầy đủ của biểu mẫu đối chiếu di chúc cục bộ
 * Trả về mã/key lỗi trung lập về ngôn ngữ để giao diện render theo ngôn ngữ hiện hành
 */
export function validateWillVerificationForm(data = {}) {
  const errors = {};

  const comparison = typeof data.comparison === 'string' ? data.comparison.trim() : '';

  if (!comparison) {
    errors.comparison = VERIFICATION_ERROR_KEYS.COMPARISON_REQUIRED;
  } else if (!VERIFICATION_COMPARISON_CHOICES.includes(comparison)) {
    errors.comparison = VERIFICATION_ERROR_KEYS.COMPARISON_INVALID;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Helper dịch mã lỗi sang thông báo theo ngôn ngữ chỉ định
 */
export function getWillVerificationErrorMessage(errorKey, lang = 'vi') {
  if (!errorKey) return '';
  const dict = legalI18n[lang] || legalI18n.vi;
  return dict[errorKey] || errorKey;
}

/**
 * Helper chuyển toàn bộ map mã lỗi thành map thông báo đã dịch
 */
export function formatWillVerificationErrors(errors = {}, lang = 'vi') {
  const dict = legalI18n[lang] || legalI18n.vi;
  const formatted = {};
  for (const [field, key] of Object.entries(errors)) {
    formatted[field] = dict[key] || key;
  }
  return formatted;
}
