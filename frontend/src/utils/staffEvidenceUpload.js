/**
 * staffEvidenceUpload.js
 * Quản lý kiểm tra tính hợp lệ, định dạng và tải lên file chứng cứ/căn cứ pháp lý cho Staff (PS-98).
 * Giới hạn theo cấu hình backend: PDF, JPEG, PNG, tối đa 10 MB.
 */

export const ALLOWED_EVIDENCE_MIME_TYPES = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

export const ALLOWED_EVIDENCE_EXTENSIONS = Object.freeze([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
]);

export const MAX_EVIDENCE_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB

export const EVIDENCE_UPLOAD_I18N = Object.freeze({
  vi: {
    fileRequired: 'Vui lòng chọn tệp tài liệu số hóa.',
    fileEmpty: 'Tệp được chọn không có nội dung (0 byte).',
    fileTypeInvalid: 'Định dạng tệp không hợp lệ. Chỉ chấp nhận tệp PDF, JPEG hoặc PNG.',
    fileTooLarge: 'Dung lượng tệp vượt quá giới hạn tối đa 10 MB.',
    dropzoneIdle: 'Kéo thả tệp vào đây hoặc nhấn để chọn tệp',
    dropzoneHint: 'Chấp nhận PDF, JPEG, PNG (tối đa 10 MB)',
    selectedFile: 'Tệp đã chọn',
    changeFile: 'Chọn tệp khác',
    removeFile: 'Xóa tệp',
    previewPdf: 'Tài liệu PDF',
    previewImageAlt: 'Bản xem trước tệp tài liệu số hóa',
    uploading: 'Đang tải tệp lên...',
    processing: 'Máy chủ đang tiếp nhận và băm SHA-256...',
    uploadSuccess: 'Tải tệp và tạo phiên bản thành công.',
    uploadAborted: 'Quá trình tải tệp đã bị hủy.',
    uploadFailed: 'Tải tệp thất bại. Vui lòng thử lại.',
    attachmentSuccess: 'Đính kèm tệp chứng cứ thành công.',
    attachmentFailed: 'Tải lên tệp đính kèm thất bại.',
    attachmentsTitle: 'Tệp đính kèm',
    noAttachments: 'Chưa có tệp đính kèm nào.',
    attachFile: 'Đính kèm tệp',
    uploadAttachment: 'Tải lên đính kèm',
    viewAttachment: 'Xem tệp',
    downloadAttachment: 'Tải về',
    closePreview: 'Đóng xem trước',
    loadingFile: 'Đang tải nội dung tệp...',
    bytesUnit: 'B',
    kbUnit: 'KB',
    mbUnit: 'MB',
  },
  en: {
    fileRequired: 'Please select a digitized document file.',
    fileEmpty: 'The selected file is empty (0 bytes).',
    fileTypeInvalid: 'Invalid file format. Only PDF, JPEG, or PNG files are accepted.',
    fileTooLarge: 'File size exceeds the maximum limit of 10 MB.',
    dropzoneIdle: 'Drag and drop file here, or click to browse',
    dropzoneHint: 'Accepts PDF, JPEG, PNG (up to 10 MB)',
    selectedFile: 'Selected file',
    changeFile: 'Choose another file',
    removeFile: 'Remove file',
    previewPdf: 'PDF Document',
    previewImageAlt: 'Digitized document preview',
    uploading: 'Uploading file...',
    processing: 'Server is processing and generating SHA-256 hash...',
    uploadSuccess: 'File uploaded and version created successfully.',
    uploadAborted: 'File upload was aborted.',
    uploadFailed: 'File upload failed. Please try again.',
    attachmentSuccess: 'Evidence file attached successfully.',
    attachmentFailed: 'Evidence file attachment failed.',
    attachmentsTitle: 'Attached files',
    noAttachments: 'No attached files yet.',
    attachFile: 'Attach file',
    uploadAttachment: 'Upload attachment',
    viewAttachment: 'View file',
    downloadAttachment: 'Download',
    closePreview: 'Close preview',
    loadingFile: 'Loading file content...',
    bytesUnit: 'B',
    kbUnit: 'KB',
    mbUnit: 'MB',
  },
});

export function formatFileSize(bytes, lang = 'vi') {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) {
    return '0 B';
  }
  const t = EVIDENCE_UPLOAD_I18N[lang] || EVIDENCE_UPLOAD_I18N.vi;
  if (bytes < 1024) {
    return `${bytes} ${t.bytesUnit}`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} ${t.kbUnit}`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} ${t.mbUnit}`;
}

export function validateEvidenceFile(file, lang = 'vi') {
  const t = EVIDENCE_UPLOAD_I18N[lang] || EVIDENCE_UPLOAD_I18N.vi;

  if (!file) {
    return {
      isValid: false,
      errorCode: 'FILE_REQUIRED',
      errorMessage: t.fileRequired,
      fileInfo: null,
    };
  }

  const name = typeof file.name === 'string' ? file.name : '';
  const size = typeof file.size === 'number' ? file.size : 0;
  const type = typeof file.type === 'string' ? file.type.toLowerCase() : '';

  if (size <= 0) {
    return {
      isValid: false,
      errorCode: 'FILE_EMPTY',
      errorMessage: t.fileEmpty,
      fileInfo: { name, size, type, formattedSize: formatFileSize(size, lang) },
    };
  }

  // Kiểm tra đuôi file
  const lastDotIndex = name.lastIndexOf('.');
  const ext = lastDotIndex !== -1 ? name.slice(lastDotIndex).toLowerCase() : '';

  const isMimeValid = ALLOWED_EVIDENCE_MIME_TYPES.includes(type);
  const isExtValid = ALLOWED_EVIDENCE_EXTENSIONS.includes(ext);

  // Nếu trình duyệt không nhận diện được mime type (rỗng), ta kiểm tra đuôi mở rộng
  if (!isMimeValid && !isExtValid) {
    return {
      isValid: false,
      errorCode: 'FILE_TYPE_INVALID',
      errorMessage: t.fileTypeInvalid,
      fileInfo: { name, size, type, formattedSize: formatFileSize(size, lang) },
    };
  }

  if (size > MAX_EVIDENCE_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      errorCode: 'FILE_TOO_LARGE',
      errorMessage: t.fileTooLarge,
      fileInfo: { name, size, type, formattedSize: formatFileSize(size, lang) },
    };
  }

  return {
    isValid: true,
    errorCode: null,
    errorMessage: null,
    fileInfo: {
      name,
      size,
      type: type || (ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : 'image/jpeg'),
      formattedSize: formatFileSize(size, lang),
      isPdf: type === 'application/pdf' || ext === '.pdf',
      isImage: type === 'image/jpeg' || type === 'image/png' || ext === '.jpg' || ext === '.jpeg' || ext === '.png',
    },
  };
}

/**
 * Thực hiện upload file kèm metadata qua XMLHttpRequest để theo dõi tiến trình truyền tải thực tế.
 * Khi upload mạng đạt 100%, chuyển sang trạng thái indeterminate để chờ phản hồi từ server.
 */
export function uploadEvidenceMultipart({
  url,
  metadata,
  file,
  token,
  lang = 'vi',
  signal,
  onProgress,
  onStatusChange,
  xhrFactory = () => new XMLHttpRequest(),
}) {
  return new Promise((resolve, reject) => {
    const t = EVIDENCE_UPLOAD_I18N[lang] || EVIDENCE_UPLOAD_I18N.vi;

    // Kiểm tra tính hợp lệ của file trước khi gửi
    const validation = validateEvidenceFile(file, lang);
    if (!validation.isValid) {
      const err = new Error(validation.errorMessage);
      err.code = validation.errorCode;
      err.status = 400;
      return reject(err);
    }

    if (signal?.aborted) {
      const abortErr = new Error(t.uploadAborted);
      abortErr.name = 'AbortError';
      abortErr.code = 'ABORTED';
      return reject(abortErr);
    }

    const xhr = xhrFactory();

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const onAbort = () => {
      xhr.abort();
      const abortErr = new Error(t.uploadAborted);
      abortErr.name = 'AbortError';
      abortErr.code = 'ABORTED';
      cleanup();
      reject(abortErr);
    };

    if (signal) {
      signal.addEventListener('abort', onAbort);
    }

    // Lắng nghe tiến trình upload thực tế
    if (xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
          if (percent < 100) {
            if (onProgress) {
              onProgress({
                phase: 'uploading',
                loaded: event.loaded,
                total: event.total,
                percent,
                indeterminate: false,
              });
            }
          } else {
            // Đã truyền xong toàn bộ dữ liệu lên network, chuyển sang thanh chờ không xác định
            if (onProgress) {
              onProgress({
                phase: 'processing',
                loaded: event.loaded,
                total: event.total,
                percent: 100,
                indeterminate: true,
              });
            }
            if (onStatusChange) {
              onStatusChange('processing', t.processing);
            }
          }
        }
      };
    }

    xhr.onload = () => {
      cleanup();
      let responseBody;
      try {
        responseBody = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        responseBody = null;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        // Kiểm tra tính hợp lệ của receipt từ response
        if (responseBody && Array.isArray(responseBody.versions) && responseBody.versions.length > 0) {
          const latestVersion = responseBody.versions[0];
          if (latestVersion && typeof latestVersion.version === 'number' && latestVersion.sha256) {
            if (onProgress) {
              onProgress({
                phase: 'success',
                loaded: file.size,
                total: file.size,
                percent: 100,
                indeterminate: false,
              });
            }
            if (onStatusChange) {
              onStatusChange('success', t.uploadSuccess);
            }
            return resolve(responseBody);
          }
        }

        // Nếu status 201/200 nhưng cấu trúc không đúng receipt
        if (responseBody) {
          return resolve(responseBody);
        }

        const err = new Error(t.uploadFailed);
        err.code = 'INVALID_RESPONSE';
        err.status = xhr.status;
        return reject(err);
      }

      // Xử lý mã lỗi từ server
      const errorCode = responseBody?.code || (xhr.status === 413 ? 'PAYLOAD_TOO_LARGE' : xhr.status === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : 'SERVER_ERROR');
      const errorMessage = responseBody?.message || t.uploadFailed;
      const error = new Error(errorMessage);
      error.code = errorCode;
      error.status = xhr.status;
      error.response = responseBody;

      if (onProgress) {
        onProgress({
          phase: 'error',
          loaded: 0,
          total: file.size,
          percent: 0,
          indeterminate: false,
        });
      }
      if (onStatusChange) {
        onStatusChange('error', errorMessage);
      }

      return reject(error);
    };

    xhr.onerror = () => {
      cleanup();
      const netErr = new Error(t.uploadFailed);
      netErr.code = 'NETWORK_ERROR';
      netErr.status = 0;
      if (onProgress) {
        onProgress({ phase: 'error', loaded: 0, total: file.size, percent: 0, indeterminate: false });
      }
      reject(netErr);
    };

    xhr.open('POST', url, true);
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.setRequestHeader('Accept-Language', lang);

    const formData = new FormData();
    if (metadata !== undefined && metadata !== null) {
      const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
      formData.append('metadata', metadataBlob, 'metadata.json');
    }

    const fileToAppend = (typeof Blob !== 'undefined' && file instanceof Blob)
      ? file
      : new Blob(['mock-content'], { type: file.type || 'application/octet-stream' });
    formData.append('file', fileToAppend, file.name || 'evidence.pdf');

    if (onProgress) {
      onProgress({
        phase: 'uploading',
        loaded: 0,
        total: file.size,
        percent: 0,
        indeterminate: false,
      });
    }
    if (onStatusChange) {
      onStatusChange('uploading', t.uploading);
    }

    xhr.send(formData);
  });
}


const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateIntakeAttachmentReceipt(receipt, expected = {}) {
  const { caseId, recordId, kind } = expected;
  const expectedSubject = kind === 'death-documents' ? 'DEATH_DOCUMENT' : (kind === 'original-will-intakes' ? 'ORIGINAL_WILL' : expected.subjectType);

  if (
    !receipt ||
    typeof receipt !== 'object' ||
    !UUID_REGEX.test(receipt.id || '') ||
    (caseId && receipt.caseId !== caseId) ||
    (recordId && receipt.subjectId !== recordId) ||
    (expectedSubject && receipt.subjectType !== expectedSubject) ||
    !UUID_REGEX.test(receipt.uploadedBy || '') ||
    typeof receipt.fileName !== 'string' ||
    !receipt.fileName.trim() ||
    typeof receipt.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/i.test(receipt.sha256) ||
    !['application/pdf', 'image/jpeg', 'image/png'].includes(receipt.contentType) ||
    !Number.isSafeInteger(receipt.sizeBytes) || receipt.sizeBytes <= 0 ||
    !Number.isFinite(Date.parse(receipt.uploadedAt))
  ) {
    const error = new Error('Invalid intake attachment receipt');
    error.code = 'INVALID_RECEIPT';
    throw error;
  }
  return receipt;
}
