/**
 * LegacyVault — Will Upload Validation (PS-7)
 *
 * Rules:
 * - File is required (non-empty)
 * - Supported MIME types: application/pdf, image/jpeg, image/png
 * - Maximum file size: 10 MB (10 * 1024 * 1024 bytes)
 * - Note is optional, maximum 500 characters
 *
 * Semantic constraints:
 * - Does not perform or assume legal verification/approval.
 * - Does not read or extract plaintext content.
 */

/**
 * Dung lượng tối đa của tệp di chúc: 10 MiB (backend vẫn kiểm tra thực tế).
 */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // PS-74 D-API-14 agreed limit; BE validates actual file content and size.
/**
 * Độ dài tối đa của ghi chú: 500 ký tự.
 */
export const MAX_NOTE_LENGTH = 500;

/**
 * Các MIME type được chấp nhận: PDF, JPEG, PNG.
 */
export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

/**
 * Các đuôi tệp được chấp nhận.
 */
export const ACCEPTED_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

/**
 * Thông điệp lỗi song ngữ (vi/en) của form tải di chúc.
 */
export const willValidationMessages = {
  vi: {
    fileRequired: 'Vui lòng chọn tệp bản di chúc cần lưu trữ.',
    fileEmpty: 'Tệp được chọn không có nội dung (kích thước 0 byte).',
    fileTypeInvalid: 'Định dạng tệp không được hỗ trợ. Vui lòng chọn tệp PDF, JPEG hoặc PNG.',
    fileSizeExceeded: 'Kích thước tệp vượt quá giới hạn tối đa cho phép (10 MB).',
    noteTooLong: 'Ghi chú không được vượt quá 500 ký tự.',
  },
  en: {
    fileRequired: 'Please select a digitized will document to upload.',
    fileEmpty: 'The selected file is empty (0 bytes).',
    fileTypeInvalid: 'Unsupported file format. Please select a PDF, JPEG, or PNG file.',
    fileSizeExceeded: 'File size exceeds the maximum allowed limit (10 MB).',
    noteTooLong: 'Note cannot exceed 500 characters.',
  },
};

/**
 * Validate will upload form inputs.
 * @param {Object} params
 * @param {File|null} params.file
 * @param {string} [params.note]
 * @param {string} [lang='vi']
 * @returns {Object} map of field errors, empty object if valid
 *
 * Kiểm tra tệp và ghi chú, trả map {trường: khóa lỗi} (fileRequired, fileEmpty, fileSizeExceeded, fileTypeInvalid, noteTooLong); rỗng nghĩa là hợp lệ. Được willService.js dùng trước khi gửi.
 */
export function getWillUploadErrors({ file, note = '' }) {
  const errors = {};
  if (!file) errors.file = 'fileRequired';
  else if (!Number.isSafeInteger(file.size) || file.size <= 0) errors.file = 'fileEmpty';
  else if (file.size > MAX_FILE_SIZE_BYTES) errors.file = 'fileSizeExceeded';
  else if (!getWillContentType(file)) errors.file = 'fileTypeInvalid';
  if (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH) errors.note = 'noteTooLong';
  return errors;
}

/**
 * Xác định MIME type chấp nhận được của tệp: theo file.type nếu có, nếu không thì theo đuôi tên tệp; trả null nếu không được hỗ trợ.
 */
export function getWillContentType(file) {
  const type = (file?.type || '').toLowerCase();
  if (type) return ACCEPTED_MIME_TYPES.includes(type) ? type : null;
  const extension = (file?.name || '').toLowerCase().split('.').pop();
  return { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }[extension] || null;
}

/**
 * Giống getWillUploadErrors nhưng trả thông điệp đã dịch theo ngôn ngữ. Dùng bởi pages/wills/WillUploadPage.jsx.
 */
export function validateWillUpload(params, lang = 'vi') {
  const messages = willValidationMessages[lang] || willValidationMessages.vi;
  return Object.fromEntries(Object.entries(getWillUploadErrors(params)).map(([field, key]) => [field, messages[key]]));
}
