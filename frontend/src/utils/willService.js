import { API_BASE, ApiError } from '../api/http.js';
import { isUtcDate } from '../api/contracts.js';
import { getWillUploadErrors, getWillContentType } from './willValidation.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (code, status) => Object.assign(new Error(code), { code, status });
const checkAbort = (signal) => { if (signal?.aborted) throw fail('ABORTED'); };

export async function computeFileSha256(file) {
  if (!file) throw fail('FILE_REQUIRED_FOR_HASH');
  let bytes;
  if (typeof file === 'string') bytes = new TextEncoder().encode(file);
  else if (ArrayBuffer.isView(file)) bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
  else if (typeof file.arrayBuffer === 'function') bytes = new Uint8Array(await file.arrayBuffer());
  else if (typeof FileReader !== 'undefined' && file instanceof Blob) {
    bytes = new Uint8Array(await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(fail('CANNOT_READ_FILE_BYTES'));
      reader.readAsArrayBuffer(file);
    }));
  } else throw fail('CANNOT_READ_FILE_BYTES');
  if (globalThis.crypto?.subtle) {
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  }
  if (globalThis.process?.versions?.node) {
    const moduleName = 'node:crypto';
    const { createHash } = await import(/* @vite-ignore */ moduleName);
    return createHash('sha256').update(bytes).digest('hex');
  }
  throw fail('CRYPTO_UNAVAILABLE');
}

export const willStatusMessages = {
  vi: {
    UPLOADED: 'Đã tải lên',
    INTEGRITY_VERIFIED: 'Đã tạo mã băm toàn vẹn SHA-256',
    NOTICE_TITLE: 'Lưu ý về bản di chúc',
    NOTICE_CONTENT:
      'Bản số hóa dùng để lưu hồ sơ. Việc tải lên chưa phải xác nhận giá trị pháp lý; bản giấy vẫn cần được kiểm tra.',
    UPLOAD_SUCCESS: 'Tải lên bản di chúc số hóa thành công.',
    UPLOAD_FAILED: 'Không thể tải lên bản di chúc. Vui lòng kiểm tra lại kết nối và thử lại.',
    FILE_LABEL: 'Tệp tài liệu di chúc',
    NOTE_LABEL: 'Ghi chú bổ sung (Tùy chọn)',
    NOTE_PLACEHOLDER: 'Ví dụ: Bản chụp được lưu ngày 12/10/2026…',
    UPLOAD_BTN: 'Tải lên bản di chúc số hóa',
    UPLOADING_BTN: 'Đang tải lên…',
    STATUS_LABEL: 'Trạng thái tài liệu',
    VERSION_LABEL: 'Phiên bản lưu trữ',
    FILE_NAME_LABEL: 'Tên tệp gốc',
    FILE_SIZE_LABEL: 'Dung lượng tệp',
    MIME_TYPE_LABEL: 'Định dạng tệp',
    SHA256_LABEL: 'Mã băm của tệp (SHA-256)',
    UPLOADED_AT_LABEL: 'Thời gian tải lên',
    CREATED_AT_LABEL: 'Thời gian khởi tạo hồ sơ',
    SHA256_HINT: 'Mã này được tạo từ nội dung tệp, dùng khi cần so sánh các bản sao để phát hiện thay đổi. Mã không xác nhận người lập hoặc giá trị pháp lý của di chúc.',
  },
  en: {
    UPLOADED: 'Uploaded',
    INTEGRITY_VERIFIED: 'SHA-256 Integrity Hash Generated',
    NOTICE_TITLE: 'About your will document',
    NOTICE_CONTENT:
      'A digitized copy is stored as a record. Uploading does not constitute legal approval; the paper document still needs to be checked.',
    UPLOAD_SUCCESS: 'Digitized will document uploaded successfully.',
    UPLOAD_FAILED: 'Failed to upload digitized will. Please check your connection and try again.',
    FILE_LABEL: 'Digitized Will Document',
    NOTE_LABEL: 'Additional Notes (Optional)',
    NOTE_PLACEHOLDER: 'e.g., Scanned copy saved on 12 October 2026…',
    UPLOAD_BTN: 'Upload Digitized Will',
    UPLOADING_BTN: 'Uploading…',
    STATUS_LABEL: 'Document Status',
    VERSION_LABEL: 'Storage Version',
    FILE_NAME_LABEL: 'Original File Name',
    FILE_SIZE_LABEL: 'File Size',
    MIME_TYPE_LABEL: 'File Format',
    SHA256_LABEL: 'File hash (SHA-256)',
    UPLOADED_AT_LABEL: 'Uploaded At',
    CREATED_AT_LABEL: 'Record Created At',
    SHA256_HINT: 'This code is generated from the file contents and can be used to compare copies for changes. It does not confirm who created the will or its legal validity.',
  },
};


export function formatFileSize(bytes = 0) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
export function formatDateTime(value, lang = 'vi') {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN');
}
const cleanName = value => typeof value === 'string' ? value.split(/[\\/]/).pop().split('').filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('').trim() : '';
const validDate = isUtcDate;

// Never turn an unrelated receipt, legal state, or malformed response into upload success.
export function readWillReceipt(data, vaultId, file, clientSha256) {
  const v = data?.currentVersion;
  if (!UUID.test(data?.id) || data?.vaultId !== vaultId || data?.status !== 'UPLOADED' ||
      !validDate(data?.createdAt) || !v || v.version !== 1 || !cleanName(v.fileName) ||
      v.fileName !== cleanName(v.fileName) || v.fileName !== cleanName(file.name) ||
      v.contentType !== getWillContentType(file) || v.sizeBytes !== file.size || !validDate(v.uploadedAt) ||
      !(/^[0-9a-f]{64}$/.test(v.sha256 || ''))) throw fail('BACKEND_NOT_READY');
  if (v.sha256 && clientSha256 && v.sha256.toLowerCase() !== clientSha256.toLowerCase()) throw fail('BACKEND_NOT_READY');
  const resolvedSha256 = v.sha256;
  // Whitelist metadata. Raw payloads, tokens and arbitrary backend fields never reach the view.
  return { id: data.id, vaultId: data.vaultId, status: 'UPLOADED', createdAt: data.createdAt,
    currentVersion: { version: v.version, fileName: v.fileName, contentType: v.contentType,
      sizeBytes: v.sizeBytes, uploadedAt: v.uploadedAt, ...(resolvedSha256 ? { sha256: resolvedSha256 } : {}) } };
}
const HTTP_ERRORS = { 400: 'VALIDATION_FAILED', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN',
  404: 'NOT_FOUND', 409: 'VAULT_NOT_EDITABLE', 413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE' };

export const willService = {
  async uploadWill(vaultId, file, note = '', options = {}) {
    checkAbort(options.signal);
    const errors = getWillUploadErrors({ file, note });
    if (Object.keys(errors).length) throw Object.assign(fail(file ? 'VALIDATION_FAILED' : 'FILE_REQUIRED'), { fieldErrors: errors });
    if (!UUID.test(vaultId || '')) throw fail('BACKEND_NOT_READY');
    const progress = value => { checkAbort(options.signal); options.onProgress?.(value); };
    progress(0);
    let clientSha256 = null;
    try {
      clientSha256 = await computeFileSha256(file);
    } catch {
      // If bytes cannot be read ahead of time, upload will still proceed with multipart
    }
    checkAbort(options.signal);
    const body = new FormData(); body.append('file', file);
    if (note.trim()) body.append('note', note.trim());
    return new Promise((resolve, reject) => {
      const xhr = options.xhrFactory ? options.xhrFactory() : new XMLHttpRequest();
      let settled = false;
      const cleanup = () => { options.signal?.removeEventListener('abort', abort); xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null; xhr.upload.onprogress = null; };
      const finish = (error, result) => { if (settled) return; settled = true; cleanup(); if (error) reject(error); else resolve(result); };
      const abort = () => { xhr.abort(); finish(fail('ABORTED')); };
      xhr.open('POST', `${API_BASE}/vaults/${vaultId}/wills`);
      xhr.withCredentials = false;
      xhr.timeout = 120000;
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('Accept-Language', options.lang === 'en' ? 'en' : 'vi');
      if (options.accessToken) xhr.setRequestHeader('Authorization', `Bearer ${options.accessToken}`);
      xhr.upload.onprogress = event => {
        if (!settled && !options.signal?.aborted) options.onProgress?.(event.lengthComputable && event.total > 0 ? Math.min(99, Math.floor(event.loaded / event.total * 100)) : null);
      };
      xhr.onload = () => {
        if (xhr.status !== 201) {
          let data = null;
          try { if (/application\/(?:[a-z0-9.+-]*\+)?json/i.test(xhr.getResponseHeader('Content-Type') || '')) data=JSON.parse(xhr.responseText); } catch { /* Safe status fallback. */ }
          return finish(new ApiError(typeof data?.code === 'string' ? data.code : (HTTP_ERRORS[xhr.status] || (xhr.status>=500 ? 'UPLOAD_FAILED' : 'BACKEND_NOT_READY')),xhr.status,{traceId:data?.traceId,messageKey:data?.messageKey}));
        }
        try {
          if (!/application\/(?:[a-z0-9.+-]*\+)?json/i.test(xhr.getResponseHeader('Content-Type') || '')) throw fail('BACKEND_NOT_READY');
          const receipt = readWillReceipt(JSON.parse(xhr.responseText), vaultId, file, clientSha256);
          progress(100); finish(null, receipt);
        } catch { finish(fail('BACKEND_NOT_READY', xhr.status)); }
      };
      xhr.onerror = () => finish(fail('UPLOAD_FAILED'));
      xhr.ontimeout = () => finish(fail('TIMEOUT'));
      xhr.onabort = () => finish(fail('ABORTED'));
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) return abort();
      try { xhr.send(body); } catch { finish(fail('UPLOAD_FAILED')); }
    });
  },
};
