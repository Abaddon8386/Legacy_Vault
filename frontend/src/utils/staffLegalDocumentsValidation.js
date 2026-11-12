/**
 * Staff Legal Documents Validation & Client Role Guard — PS-31 / PS-96 / LV-BASIS-001
 */

/**
 * Dùng bởi App.jsx và pages/staff/StaffLegalDocumentsPage.jsx.
 */
import { staffLegalDocumentsI18n } from '../pages/staff/staffLegalDocumentsI18n.js';
import { validateEvidenceFile } from './staffEvidenceUpload.js';

/**
 * Các khóa lỗi (i18n) của form tiếp nhận văn bản căn cứ pháp lý.
 */
export const STAFF_LEGAL_DOCS_ERROR_KEYS = {
  ISSUER_REQUIRED: 'issuerRequired',
  DOCUMENT_NUMBER_REQUIRED: 'documentNumberRequired',
  ISSUANCE_DATE_REQUIRED: 'issuanceDateRequired',
  ISSUANCE_DATE_INVALID: 'issuanceDateInvalid',
  NOTARY_REQUIRED: 'notaryRequired',
  FILE_REQUIRED: 'fileRequired',
};

/**
 * Chỉ ROLE_STAFF_EXECUTOR có session còn hạn mới được vào màn hình văn bản pháp lý của nhân viên.
 */
export function canAccessStaffLegalDocuments(session) {
  if (!session || !session.accessToken || typeof session.expiresAt !== 'number') {
    return false;
  }

  if (Date.now() >= session.expiresAt) {
    return false;
  }

  const roles = session.user?.roles;
  if (!Array.isArray(roles)) {
    return false;
  }

  return roles.includes('STAFF_EXECUTOR');
}

/**
 * Chọn trang đích sau đăng nhập theo vai trò (khi không đồng thời là chủ kho): pháp lý thì /legal/death-verification, nhân viên thì /staff/legal-documents, admin thì /admin, người thụ hưởng thì /shared-with-me; còn lại có vai trò thì /vault.
 */
export function resolvePostLoginRoute(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  if (roles.includes('LEGAL_VERIFIER') && !roles.includes('VAULT_OWNER')) {
    return '/legal/death-verification';
  }
  if (roles.includes('STAFF_EXECUTOR') && !roles.includes('VAULT_OWNER')) {
    return '/staff/legal-documents';
  }
  if (roles.includes('ADMIN') && !roles.includes('VAULT_OWNER')) {
    return '/admin';
  }
  if (roles.includes('BENEFICIARY') && !roles.includes('VAULT_OWNER')) {
    return '/shared-with-me';
  }
  return roles.length ? '/vault' : '/shared-with-me';
}

/**
 * Kiểm tra tính hợp lệ của toàn bộ form tiếp nhận văn bản căn cứ pháp lý:
 * - issuer: bắt buộc, không rỗng
 * - documentNumber: bắt buộc, không rỗng
 * - issuanceDate: bắt buộc, yyyy-MM-dd, không ở tương lai
 * - nếu là NOTARIAL_PARTITION: bắt buộc notaryAuthority, notarialDocumentNumber, notarizedAt (không ở tương lai)
 * - file: bắt buộc, phải là File hợp lệ theo quy chuẩn PS-98
 */
export function validateStaffLegalDocumentForm(formValues = {}, options = {}) {
  const errors = {};
  const {
    issuer,
    documentNumber,
    issuanceDate,
    legalBasisType,
    notaryAuthority,
    notarialDocumentNumber,
    notarizedAt,
    file,
  } = formValues;

  const requireFile = options.requireFile !== false;
  const lang = options.lang || 'vi';

  // 1. Cơ quan ban hành
  if (!issuer || typeof issuer !== 'string' || !issuer.trim()) {
    errors.issuer = STAFF_LEGAL_DOCS_ERROR_KEYS.ISSUER_REQUIRED;
  }

  // 2. Số hiệu văn bản
  if (!documentNumber || typeof documentNumber !== 'string' || !documentNumber.trim()) {
    errors.documentNumber = STAFF_LEGAL_DOCS_ERROR_KEYS.DOCUMENT_NUMBER_REQUIRED;
  }

  // 3. Ngày ban hành
  if (!issuanceDate || typeof issuanceDate !== 'string' || !issuanceDate.trim()) {
    errors.issuanceDate = STAFF_LEGAL_DOCS_ERROR_KEYS.ISSUANCE_DATE_REQUIRED;
  } else {
    const trimmedDate = issuanceDate.trim();
    const todayStr = new Date().toISOString().slice(0, 10);
    const isIso = /^\d{4}-\d{2}-\d{2}$/.test(trimmedDate);
    const dateObj = isIso ? new Date(trimmedDate + 'T00:00:00Z') : null;
    const isValidCalendar = Boolean(dateObj && Number.isFinite(dateObj.getTime()) && dateObj.toISOString().slice(0, 10) === trimmedDate);
    if (!isValidCalendar || trimmedDate > todayStr) {
      errors.issuanceDate = STAFF_LEGAL_DOCS_ERROR_KEYS.ISSUANCE_DATE_INVALID;
    }
  }

  // 4. Các trường công chứng nếu loại văn bản là NOTARIAL_PARTITION
  if (legalBasisType === 'NOTARIAL_PARTITION') {
    const hasNotaryOrg = Boolean(notaryAuthority && typeof notaryAuthority === 'string' && notaryAuthority.trim());
    const hasNotaryNum = Boolean(notarialDocumentNumber && typeof notarialDocumentNumber === 'string' && notarialDocumentNumber.trim());
    const hasNotaryDate = Boolean(notarizedAt && typeof notarizedAt === 'string' && notarizedAt.trim());

    if (!hasNotaryOrg || !hasNotaryNum || !hasNotaryDate) {
      errors.notary = STAFF_LEGAL_DOCS_ERROR_KEYS.NOTARY_REQUIRED;
    } else {
      const trimmedNotary = notarizedAt.trim();
      const todayStr = new Date().toISOString().slice(0, 10);
      const isIso = /^\d{4}-\d{2}-\d{2}$/.test(trimmedNotary);
      const dateObj = isIso ? new Date(trimmedNotary + 'T00:00:00Z') : null;
      const isValidCalendar = Boolean(dateObj && Number.isFinite(dateObj.getTime()) && dateObj.toISOString().slice(0, 10) === trimmedNotary);
      if (!isValidCalendar || trimmedNotary > todayStr) {
        errors.notary = STAFF_LEGAL_DOCS_ERROR_KEYS.NOTARY_REQUIRED;
      }
    }
  }

  // 5. Kiểm tra tệp đính kèm
  if (requireFile) {
    if (!file) {
      errors.file = STAFF_LEGAL_DOCS_ERROR_KEYS.FILE_REQUIRED;
    } else {
      const fileValidation = validateEvidenceFile(file, lang);
      if (!fileValidation.isValid) {
        errors.file = fileValidation.errorMessage;
      }
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Đổi khóa lỗi thành thông điệp theo ngôn ngữ (staffLegalDocumentsI18n).
 */
export function getStaffLegalDocumentErrorMessage(errorKey, lang = 'vi') {
  const dictionary = staffLegalDocumentsI18n[lang] || staffLegalDocumentsI18n.vi;
  return dictionary[errorKey] || errorKey;
}

/**
 * Đổi cả map khóa lỗi thành map thông điệp đã dịch.
 */
export function formatStaffLegalDocumentErrors(errors = {}, lang = 'vi') {
  const formatted = {};
  for (const [field, key] of Object.entries(errors)) {
    formatted[field] = getStaffLegalDocumentErrorMessage(key, lang);
  }
  return formatted;
}
