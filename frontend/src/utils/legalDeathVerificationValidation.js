import { isSessionActive } from './session.js';

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
 * Không khóa các quy tắc tự đặt ngoài AC (không giới hạn 10-1000 ký tự, không bắt buộc loại chứng cứ)
 */
export function validateDeathVerificationForm(data = {}, lang = 'vi') {
  const isEn = lang === 'en';
  const errors = {};

  const decision = typeof data.decision === 'string' ? data.decision.trim() : '';
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';

  if (!decision) {
    errors.decision = isEn
      ? 'Please select a verification option.'
      : 'Vui lòng chọn quyết định thẩm định.';
  } else if (!VERIFICATION_CHOICES.includes(decision)) {
    errors.decision = isEn
      ? 'Invalid verification option selected.'
      : 'Lựa chọn thẩm định không hợp lệ.';
  }

  if (!reason) {
    errors.reason = isEn
      ? 'Verification rationale / reason cannot be empty.'
      : 'Lý do thẩm định không được để trống.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
