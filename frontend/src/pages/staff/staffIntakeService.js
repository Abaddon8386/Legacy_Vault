/**
 * staffIntakeService.js - Kiểm tra biểu mẫu và ghi nhận hồ sơ tử vong bản cứng do Staff tiếp nhận (PS-26 / PS-38).
 * Được dùng bởi StaffCaseIntakePage.jsx. Hiện chỉ có chế độ mô phỏng; chế độ thật chưa nối backend (ném BACKEND_NOT_READY).
 */
import { getStaffCaseTranslations } from './staffCaseI18n.js';
import { isStaffSimulationPermitted } from './staffCasePreview.js';
export { SYNTHETIC_STAFF_CASES, isStaffSimulationPermitted } from './staffCasePreview.js';
/**
 * Kiểm tra dữ liệu biểu mẫu tiếp nhận hồ sơ và trả về lỗi theo từng trường (thông báo lấy từ staffCaseI18n.intake.validation).
 *
 * Quy tắc: submitterName bắt buộc; documentType bắt buộc và khác 'SELECT'; issuingDate (nếu có) phải là ngày hợp lệ yyyy-MM-dd;
 * intakeDateTime bắt buộc, định dạng yyyy-MM-ddTHH:mm và ngày hợp lệ; submitterPhone (nếu có) là số di động Việt Nam (+84 hoặc 0 rồi đầu 3,5,7,8,9 và 8 chữ số);
 * submitterEmail (nếu có) đúng dạng email cơ bản.
 * @param {Object} [data] Dữ liệu biểu mẫu.
 * @param {string} [lang='vi'] Ngôn ngữ thông báo lỗi.
 * @returns {{isValid: boolean, errors: Object}} errors là map tên trường -> thông báo.
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
 * Ghi nhận hồ sơ tử vong bản cứng do Staff tiếp nhận (PS-26 / PS-38).
 *
 * Các bước: kiểm tra signal, caseId, rồi validateIntakeForm(). Chế độ mô phỏng (dev preview hoặc test) trả về biên nhận giả
 * { success, caseId, receiptNumber (INTAKE-năm-xxxx), recordedAt, isSimulation: true }. Chế độ thật chưa gọi endpoint nào vì contract PS-38 chưa có,
 * nên ném lỗi BACKEND_NOT_READY (status 503).
 * @param {string} caseId Mã hồ sơ cần tiếp nhận.
 * @param {Object} [intakeData] Dữ liệu biểu mẫu tiếp nhận.
 * @param {Object} [options] { signal, lang, isDevPreview, isTest, accessToken }
 * @returns {Promise<Object>} Biên nhận mô phỏng.
 * @throws {Error} AbortError; MISSING_CASE_ID; VALIDATION_FAILED (kèm fieldErrors); BACKEND_NOT_READY (503).
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

/**
 * Kiểm tra biên nhận tiếp nhận (chỉ là view model mô phỏng; hợp đồng PS-38 thật chưa được nối).
 * Chỉ hợp lệ khi chế độ mô phỏng được phép, isSimulation và success đều true, caseId khớp, receiptNumber là chuỗi không rỗng và recordedAt là thời gian UTC (dạng ISO) hợp lệ.
 * @param {Object} receipt Biên nhận cần kiểm tra.
 * @param {string} caseId Mã hồ sơ mong đợi.
 * @param {Object} [options] Tùy chọn cho isStaffSimulationPermitted().
 * @returns {{success: true, caseId: string, receiptNumber: string, recordedAt: string, isSimulation: true}} Biên nhận đã chuẩn hóa.
 * @throws {Error} code INVALID_RECEIPT khi không hợp lệ.
 */
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
 * Chú thích còn sót ở cuối file, không gắn với đoạn mã nào: dữ liệu người thụ hưởng mô phỏng (theo schema BeneficiaryResponse)
 * thực tế nằm ở SYNTHETIC_BENEFICIARIES_BY_CASE trong staffIdentityService.js.
 */
