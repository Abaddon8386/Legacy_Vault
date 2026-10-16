/**
 * LegacyVault — Service & Ranh giới tích hợp Staff Verification Cases (PS-25)
 *
 * QUY TẮC AN TOÀN & KIẾN TRÚC:
 * 1. Hiện tại chưa có Controller và Contract chính thức cho PS-35 từ Backend (Long phụ trách).
 * 2. Tuyệt đối KHÔNG tự phỏng đoán endpoint, enum, query schema để gọi API thật.
 * 3. Ở chế độ Live (người dùng đã đăng nhập hoặc Production):
 *    -> Báo lỗi `BACKEND_NOT_READY` để UI hiển thị trạng thái "Dịch vụ chưa sẵn sàng".
 * 4. Ở chế độ DEV Preview (?preview=true trong DEV môi trường, KHÔNG có accessToken):
 *    -> Cung cấp dữ liệu tổng hợp (synthetic fixture data) để phục vụ review thiết kế giao diện.
 * 5. Khi build Production (PROD = true), khóa 100% chế độ mô phỏng.
 */

import { getStaffCaseTranslations } from './staffCaseI18n.js';

// Dữ liệu tổng hợp phong phú phục vụ kiểm thử và xem trước DEV (nhiều trang & trạng thái)
export const SYNTHETIC_STAFF_CASES = [
  {
    id: 'case-001',
    caseNumber: 'CASE-2026-0001',
    vaultId: 'vlt-11111111-4111-8111-111111111111',
    vaultName: 'Kho Di Sản Gia Đình Vance',
    ownerName: 'Trần Đình Trọng',
    gracePeriodEndedAt: '2026-10-12T08:00:00Z',
    status: 'AWAITING_VERIFICATION',
  },
  {
    id: 'case-002',
    caseNumber: 'CASE-2026-0002',
    vaultId: 'vlt-22222222-4222-8222-222222222222',
    vaultName: 'Tài Sản Cá Nhân Nguyễn Mai',
    ownerName: 'Nguyễn Thị Mai',
    gracePeriodEndedAt: '2026-10-13T14:30:00Z',
    status: 'IN_PROGRESS',
  },
  {
    id: 'case-003',
    caseNumber: 'CASE-2026-0003',
    vaultId: 'vlt-33333333-4333-8333-333333333333',
    vaultName: 'Kho Di Sản Hùng Cường',
    ownerName: 'Phạm Quốc Hùng',
    gracePeriodEndedAt: '2026-10-14T09:15:00Z',
    status: 'AWAITING_VERIFICATION',
  },
  {
    id: 'case-004',
    caseNumber: 'CASE-2026-0004',
    vaultId: 'vlt-44444444-4444-8444-444444444444',
    vaultName: 'Di Sản Gia Tộc Lê Hoàng',
    ownerName: 'Lê Hoàng Yến',
    gracePeriodEndedAt: '2026-10-14T16:45:00Z',
    status: 'VERIFIED',
  },
  {
    id: 'case-005',
    caseNumber: 'CASE-2026-0005',
    vaultId: 'vlt-55555555-4555-8555-555555555555',
    vaultName: 'Lưu Trữ Di Sản Kỹ Thuật Số Vũ Đức',
    ownerName: 'Vũ Đức Đam',
    gracePeriodEndedAt: '2026-10-15T07:20:00Z',
    status: 'AWAITING_VERIFICATION',
  },
  {
    id: 'case-006',
    caseNumber: 'CASE-2026-0006',
    vaultId: 'vlt-66666666-4666-8666-666666666666',
    vaultName: 'Kho Di Sản Đỗ Gia',
    ownerName: 'Đỗ Mỹ Linh',
    gracePeriodEndedAt: '2026-10-15T11:00:00Z',
    status: 'IN_PROGRESS',
  },
  {
    id: 'case-007',
    caseNumber: 'CASE-2026-0007',
    vaultId: 'vlt-77777777-4777-8777-777777777777',
    vaultName: 'Di Sản Nghệ Thuật Hoàng Bách',
    ownerName: 'Hoàng Bách',
    gracePeriodEndedAt: '2026-10-15T18:10:00Z',
    status: 'AWAITING_VERIFICATION',
  },
  {
    id: 'case-008',
    caseNumber: 'CASE-2026-0008',
    vaultId: 'vlt-88888888-4888-8888-888888888888',
    vaultName: 'Kho Tư Liệu Số Nguyễn Bảo',
    ownerName: 'Nguyễn Quốc Bảo',
    gracePeriodEndedAt: '2026-10-15T20:00:00Z',
    status: 'VERIFIED',
  },
];

/**
 * Kiểm tra xem môi trường hiện tại có cho phép chạy dữ liệu tổng hợp (synthetic fixture) hay không.
 */
export function isStaffSimulationPermitted(options = {}) {
  // 1. Nếu có token đăng nhập thật -> Tuyệt đối không dùng mô phỏng
  if (options.accessToken) return false;

  // 2. Nếu ở Production build -> Khóa hoàn toàn mô phỏng
  const isViteProd = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.PROD);
  const isTestProd = Boolean(options.testEnv?.PROD);
  if (isViteProd || isTestProd) return false;

  // 3. Cho phép khi ở DEV mode có bật isDevPreview hoặc trong môi trường test (isTest)
  return Boolean(options.isDevPreview) || Boolean(options.isTest);
}

/**
 * Lấy danh sách hồ sơ cần xác minh cho Staff.
 * @param {Object} options - { page, size, status, accessToken, isDevPreview, isTest, lang, signal }
 */
export async function fetchStaffCases(options = {}) {
  const { page = 0, size = 5, status = 'ALL', signal } = options;

  if (signal?.aborted) {
    const abortErr = new Error('Request aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  // Nếu được phép mô phỏng (DEV preview hoặc unit test):
  if (isStaffSimulationPermitted(options)) {
    // Độ trễ nhẹ mô phỏng mạng trong DEV preview khi không ở môi trường test
    const isTestEnvironment = Boolean(
      options.isTest ||
      (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT)
    );
    if (!isTestEnvironment) {
      await new Promise((r) => setTimeout(r, 150));
    }

    if (signal?.aborted) {
      const abortErr = new Error('Request aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    // Lọc theo trạng thái
    let filtered = [...SYNTHETIC_STAFF_CASES];
    if (status && status !== 'ALL') {
      filtered = filtered.filter((c) => c.status === status);
    }

    const totalElements = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalElements / size));
    const safePage = Math.min(page, totalPages - 1);
    const start = safePage * size;
    const paginated = filtered.slice(start, start + size);

    return {
      content: paginated,
      page: safePage,
      size,
      totalElements,
      totalPages,
      isSimulation: true,
    };
  }

  // Chế độ thật (Live Mode):
  // Vì Long (BE) chưa cung cấp controller và contract chính thức cho PS-35,
  // chúng ta không được phép gọi endpoint phỏng đoán.
  // Trả về lỗi BACKEND_NOT_READY rõ ràng để UI hiển thị trạng thái phù hợp.
  const notReadyError = new Error(
    'Dịch vụ tiếp nhận hồ sơ xác minh (PS-35) hiện chưa được kết nối máy chủ.'
  );
  notReadyError.code = 'BACKEND_NOT_READY';
  notReadyError.status = 503;
  throw notReadyError;
}

/**
 * Kiểm tra tính hợp lệ của dữ liệu biểu mẫu tiếp nhận hồ sơ (PS-26 / PS-38)
 */
export function validateIntakeForm(data = {}, lang = 'vi') {
  const t = getStaffCaseTranslations(lang).intake.validation;
  const errors = {};

  if (!String(data.submitterName || '').trim()) errors.submitterName = t.submitterNameRequired;
  const type = String(data.documentType || '').trim();
  if (!type || type === 'SELECT') errors.documentType = t.documentTypeRequired;
  const validDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (data.issuingDate && !validDate(String(data.issuingDate))) errors.issuingDate = t.issuingDateInvalid;
  const time = String(data.intakeDateTime || '').trim();
  if (!time) errors.intakeDateTime = t.intakeDateTimeRequired;
  else if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) || !validDate(time.slice(0, 10))) {
    errors.intakeDateTime = t.intakeDateTimeInvalid;
  }

  // 7. Các trường đề xuất tùy chọn (nếu có nhập thì kiểm tra định dạng)
  const submitterPhone = String(data.submitterPhone || '').trim();
  if (submitterPhone) {
    const digitsOnly = submitterPhone.replace(/[\s.-]/g, '');
    const phoneRegex = /^(?:\+84|0)(?:[35789])\d{8}$/;
    if (!phoneRegex.test(digitsOnly)) {
      errors.submitterPhone = t.invalidPhone;
    }
  }

  const submitterEmail = String(data.submitterEmail || '').trim();
  if (submitterEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(submitterEmail)) {
      errors.submitterEmail = t.invalidEmail;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Ghi nhận hồ sơ tử vong bản cứng do Staff tiếp nhận (PS-26 / PS-38)
 */
export async function submitPhysicalIntakeRecord(caseId, intakeData = {}, options = {}) {
  const { signal, lang = 'vi' } = options;

  if (signal?.aborted) {
    const abortErr = new Error('Request aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  if (!caseId) {
    const err = new Error('Thiếu mã hồ sơ cần tiếp nhận');
    err.code = 'MISSING_CASE_ID';
    throw err;
  }

  // Kiểm tra tính hợp lệ dữ liệu
  const validation = validateIntakeForm(intakeData, lang);
  if (!validation.isValid) {
    const valErr = new Error('Dữ liệu tiếp nhận hồ sơ không hợp lệ');
    valErr.code = 'VALIDATION_FAILED';
    valErr.fieldErrors = validation.errors;
    throw valErr;
  }

  // Chế độ mô phỏng (DEV Preview hoặc test):
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

    const receiptNumber = `INTAKE-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

    return {
      success: true,
      caseId,
      receiptNumber,
      recordedAt: new Date().toISOString(),
      isSimulation: true,
    };
  }

  // Chế độ thật (Live Mode):
  // Vì Dương (BE) chưa cung cấp controller và contract chính thức cho PS-38,
  // chúng ta tuyệt đối không gọi endpoint phỏng đoán.
  const notReadyError = new Error(
    'Dịch vụ tiếp nhận hồ sơ tử vong bản cứng (PS-38) hiện chưa được kết nối máy chủ.'
  );
  notReadyError.code = 'BACKEND_NOT_READY';
  notReadyError.status = 503;
  throw notReadyError;
}

// Preview receipt view model only; the live PS-38 contract is not connected yet.
export function validateIntakeReceipt(receipt, caseId, options = {}) {
  const stamp = receipt?.recordedAt;
  const validStamp = typeof stamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(stamp)
    && Number.isFinite(Date.parse(stamp))
    && new Date(stamp).toISOString().replace('.000Z', 'Z') === stamp.replace('.000Z', 'Z');
  if (!isStaffSimulationPermitted(options) || receipt?.isSimulation !== true || receipt?.success !== true
    || receipt?.caseId !== caseId || typeof receipt?.receiptNumber !== 'string'
    || !receipt.receiptNumber.trim() || !validStamp) {
    const error = new Error('Invalid intake receipt');
    error.code = 'INVALID_RECEIPT';
    throw error;
  }
  return { success: true, caseId, receiptNumber: receipt.receiptNumber.trim(), recordedAt: stamp, isSimulation: true };
}

/**
 * Dữ liệu người thụ hưởng tổng hợp gắn với từng case (PS-45 & PS-27 DEV Preview)
 * Theo đúng schema BeneficiaryResponse trong openapi.yaml
 */
