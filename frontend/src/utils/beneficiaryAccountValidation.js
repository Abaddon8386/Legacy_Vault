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

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return {
      isValid: false,
      errorKey: 'emailInvalid',
      messageVi: 'Định dạng email không hợp lệ.',
      messageEn: 'Invalid email format.',
    };
  }

  return { isValid: true, email: trimmed };
}

export function validateCreateBeneficiaryAccountForm(data = {}) {
  const errors = {};

  const fullName = String(data.fullName || '').trim();
  if (!fullName) {
    errors.fullName = 'fullNameRequired';
  } else if (fullName.length > 150) {
    errors.fullName = 'fullNameTooLong';
  }

  const email = String(data.email || '').trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) {
    errors.email = 'emailRequired';
  } else if (!emailRegex.test(email)) {
    errors.email = 'emailInvalid';
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

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
