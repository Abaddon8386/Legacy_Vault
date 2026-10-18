import { getStaffCaseTranslations } from './staffCaseI18n.js';
import { isStaffSimulationPermitted } from './staffCasePreview.js';
export { SYNTHETIC_STAFF_CASES, isStaffSimulationPermitted } from './staffCasePreview.js';
export const SYNTHETIC_BENEFICIARIES_BY_CASE = {
  'case-001': [
    {
      id: 'ben-001-1',
      vaultId: 'vlt-11111111-4111-8111-111111111111',
      fullName: 'Trần Minh Quang',
      relationship: 'Con trai',
      dateOfBirth: '1998-05-12',
      phone: '0901111222',
      email: 'quang.tran@example.com',
      hasIdentityNumber: true,
      hasAccount: false,
      status: 'DESIGNATED',
    },
    {
      id: 'ben-001-2',
      vaultId: 'vlt-11111111-4111-8111-111111111111',
      fullName: 'Trần Thảo Ly',
      relationship: 'Con gái',
      dateOfBirth: '2002-11-20',
      phone: '0903333444',
      email: 'ly.tran@example.com',
      hasIdentityNumber: true,
      hasAccount: false,
      status: 'DESIGNATED',
    },
  ],
  'case-002': [
    {
      id: 'ben-002-1',
      vaultId: 'vlt-22222222-4222-8222-222222222222',
      fullName: 'Nguyễn Văn An',
      relationship: 'Cháu ruột',
      dateOfBirth: '2000-01-15',
      phone: '0912222333',
      email: 'an.nguyen@example.com',
      hasIdentityNumber: true,
      hasAccount: false,
      status: 'DESIGNATED',
    },
  ],
  'case-003': [
    {
      id: 'ben-003-1',
      vaultId: 'vlt-33333333-4333-8333-333333333333',
      fullName: 'Phạm Thu Hương',
      relationship: 'Vợ',
      dateOfBirth: '1975-08-22',
      phone: '0984444555',
      email: 'huong.pham@example.com',
      hasIdentityNumber: true,
      hasAccount: false,
      status: 'DESIGNATED',
    },
  ],
};

// Lịch sử xác minh mô phỏng theo beneficiaryId (in-memory per session)
export const SYNTHETIC_VERIFICATION_HISTORY = {};

/**
 * Lấy danh sách Người thụ hưởng thuộc hồ sơ (PS-27)
 */
export async function fetchCaseBeneficiaries(caseId, options = {}) {
  const { signal } = options;

  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  if (!caseId) {
    const err = new Error('Thiếu mã hồ sơ cần tải danh sách người thụ hưởng');
    err.code = 'MISSING_CASE_ID';
    throw err;
  }

  if (isStaffSimulationPermitted(options)) {
    const isTestEnvironment = Boolean(
      options.isTest ||
      (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT)
    );
    if (!isTestEnvironment) {
      await new Promise((r) => setTimeout(r, 100));
    }

    if (signal?.aborted) {
      const err = new Error('Request aborted');
      err.name = 'AbortError';
      throw err;
    }

    const list = SYNTHETIC_BENEFICIARIES_BY_CASE[caseId] || [];

    return {
      beneficiaries: list.map((b) => ({ ...b })),
      caseId,
      isSimulation: true,
    };
  }

  const notReadyError = new Error(
    'Dịch vụ lấy danh sách người thụ hưởng hồ sơ (Staff) hiện chưa được kết nối máy chủ.'
  );
  notReadyError.code = 'BACKEND_NOT_READY';
  notReadyError.status = 503;
  throw notReadyError;
}

/**
 * Lấy lịch sử xác minh danh tính của người thụ hưởng (GET /api/v1/staff/beneficiaries/{beneficiaryId}/identity-verifications)
 */
export async function fetchVerificationHistory(beneficiaryId, options = {}) {
  const { signal } = options;

  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  if (!beneficiaryId) {
    const err = new Error('Thiếu mã người thụ hưởng cần xem lịch sử xác minh');
    err.code = 'MISSING_BENEFICIARY_ID';
    throw err;
  }

  if (isStaffSimulationPermitted(options)) {
    const isTestEnvironment = Boolean(
      options.isTest ||
      (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT)
    );
    if (!isTestEnvironment) {
      await new Promise((r) => setTimeout(r, 100));
    }

    if (signal?.aborted) {
      const err = new Error('Request aborted');
      err.name = 'AbortError';
      throw err;
    }

    const history = SYNTHETIC_VERIFICATION_HISTORY[beneficiaryId] || [];
    return {
      history: history.map((item) => ({ ...item })),
      beneficiaryId,
      isSimulation: true,
    };
  }

  const notReadyError = new Error(
    'Dịch vụ lịch sử xác minh danh tính (PS-45) hiện chưa được kết nối máy chủ.'
  );
  notReadyError.code = 'BACKEND_NOT_READY';
  notReadyError.status = 503;
  throw notReadyError;
}

/**
 * Kiểm tra tính hợp lệ biểu mẫu xác minh danh tính trực tiếp (PS-27 / PS-45)
 */
export function validateVerificationForm(data = {}, lang = 'vi') {
  const t = getStaffCaseTranslations(lang).verification.form;
  const errors = {};

  // 1. documentType (bắt buộc: CCCD hoặc PASSPORT)
  const docType = String(data.documentType || '').trim();
  if (!docType || docType === 'SELECT') {
    errors.documentType = t.documentTypeRequired;
  } else if (docType !== 'CCCD' && docType !== 'PASSPORT') {
    errors.documentType = t.documentTypeRequired;
  }

  // 2. result (bắt buộc: MATCH hoặc NOT_MATCH)
  const result = String(data.result || '').trim();
  if (!result) {
    errors.result = t.resultRequired;
  } else if (result !== 'MATCH' && result !== 'NOT_MATCH') {
    errors.result = t.resultRequired;
  }

  // 3. documentSuffix (tùy chọn: nếu nhập thì phải đúng 4 ký tự alphanumeric ^[0-9A-Za-z]{4}$)
  const suffix = String(data.documentSuffix || '').trim();
  if (suffix) {
    if (!/^[0-9A-Za-z]{4}$/.test(suffix)) {
      errors.documentSuffix = t.documentSuffixInvalid;
    }
  }

  // 4. issuingAuthority (tùy chọn, tối đa 150 ký tự)
  const authority = String(data.issuingAuthority || '').trim();
  if (authority && authority.length > 150) {
    errors.issuingAuthority = t.issuingAuthorityTooLong;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Ghi nhận xác minh danh tính trực tiếp (POST /api/v1/staff/beneficiaries/{beneficiaryId}/identity-verifications)
 */
export async function submitIdentityVerification(beneficiaryId, data = {}, options = {}) {
  const { signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const abortErr = new Error('Request aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  if (!beneficiaryId) {
    const err = new Error('Thiếu mã người thụ hưởng cần xác minh');
    err.code = 'MISSING_BENEFICIARY_ID';
    throw err;
  }

  const validation = validateVerificationForm(data, lang);
  if (!validation.isValid) {
    const valErr = new Error('Dữ liệu xác minh danh tính không hợp lệ');
    valErr.code = 'VALIDATION_FAILED';
    valErr.fieldErrors = validation.errors;
    throw valErr;
  }

  if (isStaffSimulationPermitted(options)) {
    const isTestEnvironment = Boolean(
      options.isTest ||
      (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT)
    );
    if (!isTestEnvironment) {
      await new Promise((r) => setTimeout(r, 200));
    }

    if (signal?.aborted) {
      const abortErr = new Error('Request aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const record = {
      id: `ver-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      beneficiaryId,
      documentType: data.documentType,
      result: data.result,
      issuingAuthority: data.issuingAuthority?.trim() || null,
      documentSuffix: data.documentSuffix?.trim() || null,
      verifiedAt: new Date().toISOString(),
      isSimulation: true,
    };

    if (!SYNTHETIC_VERIFICATION_HISTORY[beneficiaryId]) {
      SYNTHETIC_VERIFICATION_HISTORY[beneficiaryId] = [];
    }
    SYNTHETIC_VERIFICATION_HISTORY[beneficiaryId].unshift(record);

    return record;
  }

  const notReadyError = new Error(
    'Dịch vụ xác minh danh tính trực tiếp (PS-45) hiện chưa được kết nối máy chủ.'
  );
  notReadyError.code = 'BACKEND_NOT_READY';
  notReadyError.status = 503;
  throw notReadyError;
}

/**
 * Xác thực receipt kết quả xác minh danh tính (PS-27 / PS-45)
 */
export function validateVerificationReceipt(receipt, beneficiaryId, options = {}) {
  const stamp = receipt?.verifiedAt;
  const validStamp = typeof stamp === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(stamp)
    && Number.isFinite(Date.parse(stamp))
    && new Date(stamp).toISOString().replace('.000Z', 'Z') === stamp.replace('.000Z', 'Z');

  if (
    !isStaffSimulationPermitted(options) ||
    receipt?.isSimulation !== true ||
    receipt?.beneficiaryId !== beneficiaryId ||
    typeof receipt?.id !== 'string' || !receipt.id.trim() ||
    (options.expectedDocumentType && receipt.documentType !== options.expectedDocumentType) ||
    (options.expectedResult && receipt.result !== options.expectedResult) ||
    (receipt?.documentSuffix != null && !/^[0-9A-Za-z]{4}$/.test(receipt.documentSuffix)) ||
    (receipt?.issuingAuthority != null && (typeof receipt.issuingAuthority !== 'string' || receipt.issuingAuthority.length > 150)) ||
    (receipt?.documentType !== 'CCCD' && receipt?.documentType !== 'PASSPORT') ||
    (receipt?.result !== 'MATCH' && receipt?.result !== 'NOT_MATCH') ||
    !validStamp
  ) {
    const error = new Error('Invalid verification receipt');
    error.code = 'INVALID_RECEIPT';
    throw error;
  }

  return {
    id: receipt.id.trim(),
    beneficiaryId,
    documentType: receipt.documentType,
    result: receipt.result,
    documentSuffix: receipt.documentSuffix ?? null,
    issuingAuthority: receipt.issuingAuthority ?? null,
    verifiedAt: stamp,
    isSimulation: true,
  };
}
