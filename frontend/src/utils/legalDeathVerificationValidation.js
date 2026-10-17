import { isSessionActive } from './session.js';
import { legalI18n } from '../pages/legal/legalI18n.js';

/**
 * PS-28: Legal Death Verification (ST-12) - Quy tắc LV-DEATH-002
 *
 * Chỉ kiểm tra các ràng buộc thực tế theo AC:
 * - Lựa chọn quyết định thuộc 3 hành động giao diện: APPROVE, REJECT, REQUEST_MORE_EVIDENCE
 * - Lý do thẩm định (reason) không được để trống sau khi trim
 * - Không tự ý đặt enum audit state hay loại chứng cứ khi chưa có API contract
 */

export const VERIFICATION_CHOICES = Object.freeze([
  'APPROVE',
  'REJECT',
  'REQUEST_MORE_EVIDENCE',
]);

export const VERIFICATION_ERROR_KEYS = Object.freeze({
  DECISION_REQUIRED: 'decisionRequired',
  DECISION_INVALID: 'decisionInvalid',
  REASON_REQUIRED: 'reasonRequired',
});

/**
 * Hàm kiểm tra quyền truy cập route Legal Death Verification dùng thật trong ứng dụng
 * Yêu cầu: phiên còn hiệu lực và người dùng có role LEGAL_VERIFIER
 */
export function canAccessLegalDeathVerification(session) {
  if (!isSessionActive(session)) {
    return false;
  }
  return Boolean(session?.user?.roles?.includes('LEGAL_VERIFIER'));
}

/**
 * Kiểm tra tính đầy đủ của biểu mẫu thẩm định cục bộ
 * Trả về mã/key lỗi trung lập về ngôn ngữ để giao diện render theo ngôn ngữ hiện hành
 */
export function validateDeathVerificationForm(data = {}) {
  const errors = {};

  const decision = typeof data.decision === 'string' ? data.decision.trim() : '';
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';

  if (!decision) {
    errors.decision = VERIFICATION_ERROR_KEYS.DECISION_REQUIRED;
  } else if (!VERIFICATION_CHOICES.includes(decision)) {
    errors.decision = VERIFICATION_ERROR_KEYS.DECISION_INVALID;
  }

  if (!reason) {
    errors.reason = VERIFICATION_ERROR_KEYS.REASON_REQUIRED;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Helper dịch mã lỗi sang thông báo theo ngôn ngữ chỉ định
 */
export function getVerificationErrorMessage(errorKey, lang = 'vi') {
  if (!errorKey) return '';
  const dict = legalI18n[lang] || legalI18n.vi;
  return dict[errorKey] || errorKey;
}

/**
 * Helper chuyển toàn bộ map mã lỗi thành map thông báo đã dịch
 */
export function formatDeathVerificationErrors(errors = {}, lang = 'vi') {
  const dict = legalI18n[lang] || legalI18n.vi;
  const formatted = {};
  for (const [field, key] of Object.entries(errors)) {
    formatted[field] = dict[key] || key;
  }
  return formatted;
}
