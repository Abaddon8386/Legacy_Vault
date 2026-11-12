/**
 * Kiểm tra form tài khoản người thụ hưởng ở phía nhân viên (liên kết tài khoản có sẵn / tạo tài khoản mới).
 * Được dùng bởi pages/staff/beneficiaryAccountService.js; quy tắc bám theo DTO của backend (server vẫn là nơi quyết định).
 *
 * Số điện thoại: tùy chọn dấu +, 8-15 chữ số.
 */
export const BENEFICIARY_PHONE_REGEX = /^\+?[0-9]{8,15}$/;
/**
 * Định dạng email cơ bản: có @ và có dấu chấm ở phần tên miền.
 */
export const BENEFICIARY_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Kiểm tra email của tài khoản có sẵn cần liên kết với người thụ hưởng (bắt buộc, tối đa 254 ký tự, đúng định dạng).
 * @param {string} email Email nhập vào.
 * @returns {{isValid:boolean,errorKey?:string,messageVi?:string,messageEn?:string,email?:string}} Khi hợp lệ trả email đã trim.
 */
export function validateLinkExistingAccountForm(email) {
  const trimmed = String(email || '').trim();
  if (!trimmed) {
    return {
      isValid: false,
      errorKey: 'emailRequired',
      messageVi: 'Vui lòng nhập email tài khoản cần liên kết.',
      messageEn: 'Please enter registered account email.',
    };
  }

  if (trimmed.length > 254) {
    return {
      isValid: false,
      errorKey: 'emailTooLong',
      messageVi: 'Email vượt quá độ dài tối đa (254 ký tự).',
      messageEn: 'Email exceeds maximum length (254 characters).',
    };
  }

  if (!BENEFICIARY_EMAIL_REGEX.test(trimmed)) {
    return {
      isValid: false,
      errorKey: 'emailInvalid',
      messageVi: 'Định dạng email không hợp lệ.',
      messageEn: 'Invalid email format.',
    };
  }

  return { isValid: true, email: trimmed };
}

/**
 * Kiểm tra form tạo tài khoản cho người thụ hưởng.
 * Chế độ live (options.isLive): email bắt buộc, phone tùy chọn (khớp BENEFICIARY_PHONE_REGEX), password bắt buộc 8-72 ký tự (không trim); họ tên do backend lấy từ hồ sơ người thụ hưởng.
 * Chế độ preview: giữ quy tắc cũ cho dữ liệu mẫu (fullName, phone bắt buộc).
 * @returns {{isValid:boolean,errors:Record<string,string>}} Giá trị lỗi là khóa như emailRequired, phoneInvalid, passwordLengthInvalid.
 */
export function validateCreateBeneficiaryAccountForm(data = {}, options = {}) {
  const errors = {};
  const isLive = Boolean(options?.isLive);

  // Email validation (Strict for both live and preview)
  const email = String(data.email || '').trim();
  if (!email) {
    errors.email = 'emailRequired';
  } else if (email.length > 254) {
    errors.email = 'emailTooLong';
  } else if (!BENEFICIARY_EMAIL_REGEX.test(email)) {
    errors.email = 'emailInvalid';
  }

  if (isLive) {
    // Live: Phone is optional per BE DTO pattern ^$|^\+?[0-9]{8,15}$
    const rawPhone = data.phone !== undefined && data.phone !== null ? String(data.phone).trim() : '';
    if (rawPhone.length > 0 && !BENEFICIARY_PHONE_REGEX.test(rawPhone)) {
      errors.phone = 'phoneInvalid';
    }

    // Live: Password is strictly required per BE DTO @NotBlank @Size(min = 8, max = 72)
    // Note: Do NOT trim before sending, validate original character length
    if (
      data.password === undefined ||
      data.password === null ||
      typeof data.password !== 'string' ||
      data.password.trim().length === 0
    ) {
      errors.password = 'passwordRequired';
    } else if (data.password.length < 8 || data.password.length > 72) {
      errors.password = 'passwordLengthInvalid';
    }

    // FullName is read-only in Live UI as backend derives it from the beneficiary record
  } else {
    // Preview / Synthetic test runner mode: preserve legacy fixture validation
    const fullName = String(data.fullName || '').trim();
    if (!fullName) {
      errors.fullName = 'fullNameRequired';
    } else if (fullName.length > 150) {
      errors.fullName = 'fullNameTooLong';
    }

    const phone = String(data.phone || '').trim();
    if (!phone) {
      errors.phone = 'phoneRequired';
    } else {
      const phoneRegex = /^[0-9+() -]{8,20}$/;
      if (!phoneRegex.test(phone)) {
        errors.phone = 'phoneInvalid';
      }
    }

    if (data.password !== undefined && data.password !== null) {
      const password = String(data.password);
      if (!password.trim()) {
        errors.password = 'passwordRequired';
      } else if (password.length < 8 || password.length > 72) {
        errors.password = 'passwordLengthInvalid';
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
