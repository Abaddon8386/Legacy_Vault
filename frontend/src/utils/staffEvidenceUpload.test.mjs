import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateEvidenceFile,
  formatFileSize,
  uploadEvidenceMultipart,
  ALLOWED_EVIDENCE_MIME_TYPES,
  ALLOWED_EVIDENCE_EXTENSIONS,
  MAX_EVIDENCE_FILE_SIZE_BYTES,
  EVIDENCE_UPLOAD_I18N,
} from './staffEvidenceUpload.js';

test('PS-98: Constants match backend contracts and limits', () => {
  assert.equal(MAX_EVIDENCE_FILE_SIZE_BYTES, 10 * 1024 * 1024);
  assert.deepEqual(ALLOWED_EVIDENCE_MIME_TYPES, ['application/pdf', 'image/jpeg', 'image/png']);
  assert.deepEqual(ALLOWED_EVIDENCE_EXTENSIONS, ['.pdf', '.jpg', '.jpeg', '.png']);
});

test('PS-98: formatFileSize formats bytes into B, KB, MB in VI and EN', () => {
  assert.equal(formatFileSize(0, 'vi'), '0 B');
  assert.equal(formatFileSize(500, 'vi'), '500 B');
  assert.equal(formatFileSize(1024, 'vi'), '1.0 KB');
  assert.equal(formatFileSize(1536, 'vi'), '1.5 KB');
  assert.equal(formatFileSize(1048576, 'vi'), '1.00 MB');
  assert.equal(formatFileSize(5242880, 'vi'), '5.00 MB');

  assert.equal(formatFileSize(1024, 'en'), '1.0 KB');
  assert.equal(formatFileSize(1048576, 'en'), '1.00 MB');
  assert.equal(formatFileSize(-1, 'vi'), '0 B');
  assert.equal(formatFileSize(NaN, 'vi'), '0 B');
});

test('PS-98: validateEvidenceFile checks null, empty, wrong extension, and oversize', () => {
  // Null / undefined file
  const nullCheck = validateEvidenceFile(null, 'vi');
  assert.equal(nullCheck.isValid, false);
  assert.equal(nullCheck.errorCode, 'FILE_REQUIRED');
  assert.equal(nullCheck.errorMessage, EVIDENCE_UPLOAD_I18N.vi.fileRequired);

  // EN translation
  const nullCheckEn = validateEvidenceFile(null, 'en');
  assert.equal(nullCheckEn.errorMessage, EVIDENCE_UPLOAD_I18N.en.fileRequired);

  // 0 byte file
  const emptyFile = { name: 'test.pdf', size: 0, type: 'application/pdf' };
  const emptyCheck = validateEvidenceFile(emptyFile, 'vi');
  assert.equal(emptyCheck.isValid, false);
  assert.equal(emptyCheck.errorCode, 'FILE_EMPTY');
  assert.equal(emptyCheck.errorMessage, EVIDENCE_UPLOAD_I18N.vi.fileEmpty);

  // Invalid extension / mime
  const exeFile = { name: 'virus.exe', size: 1024, type: 'application/x-msdownload' };
  const exeCheck = validateEvidenceFile(exeFile, 'vi');
  assert.equal(exeCheck.isValid, false);
  assert.equal(exeCheck.errorCode, 'FILE_TYPE_INVALID');
  assert.equal(exeCheck.errorMessage, EVIDENCE_UPLOAD_I18N.vi.fileTypeInvalid);

  const docxFile = { name: 'report.docx', size: 2048, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  const docxCheck = validateEvidenceFile(docxFile, 'vi');
  assert.equal(docxCheck.isValid, false);
  assert.equal(docxCheck.errorCode, 'FILE_TYPE_INVALID');

  // File too large (> 10MB)
  const largeFile = { name: 'huge.pdf', size: 10 * 1024 * 1024 + 1, type: 'application/pdf' };
  const largeCheck = validateEvidenceFile(largeFile, 'vi');
  assert.equal(largeCheck.isValid, false);
  assert.equal(largeCheck.errorCode, 'FILE_TOO_LARGE');
  assert.equal(largeCheck.errorMessage, EVIDENCE_UPLOAD_I18N.vi.fileTooLarge);

  // Valid PDF
  const validPdf = { name: 'legal-partition.pdf', size: 2 * 1024 * 1024, type: 'application/pdf' };
  const validPdfCheck = validateEvidenceFile(validPdf, 'vi');
  assert.equal(validPdfCheck.isValid, true);
  assert.equal(validPdfCheck.errorCode, null);
  assert.equal(validPdfCheck.fileInfo.isPdf, true);
  assert.equal(validPdfCheck.fileInfo.isImage, false);
  assert.equal(validPdfCheck.fileInfo.formattedSize, '2.00 MB');

  // Valid JPEG
  const validJpg = { name: 'notary-stamp.jpg', size: 500 * 1024, type: 'image/jpeg' };
  const validJpgCheck = validateEvidenceFile(validJpg, 'vi');
  assert.equal(validJpgCheck.isValid, true);
  assert.equal(validJpgCheck.fileInfo.isImage, true);
  assert.equal(validJpgCheck.fileInfo.isPdf, false);

  // Valid PNG
  const validPng = { name: 'court-decision.png', size: 1.5 * 1024 * 1024, type: 'image/png' };
  const validPngCheck = validateEvidenceFile(validPng, 'vi');
  assert.equal(validPngCheck.isValid, true);
  assert.equal(validPngCheck.fileInfo.isImage, true);
});

// Mock XHR helper
class MockXMLHttpRequest {
  constructor() {
    this.upload = { onprogress: null };
    this.headers = {};
    this.status = 200;
    this.responseText = '';
    this.onload = null;
    this.onerror = null;
    this.aborted = false;
  }

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key, value) {
    this.headers[key] = value;
  }

  send(data) {
    this.sentData = data;
  }

  abort() {
    this.aborted = true;
  }
}

test('PS-98: uploadEvidenceMultipart executes real progress then switches to indeterminate processing', async () => {
  const mockXhr = new MockXMLHttpRequest();
  const progressEvents = [];
  const statusEvents = [];

  const validFile = new File([new Uint8Array(1000)], 'contract.pdf', { type: 'application/pdf' });

  const uploadPromise = uploadEvidenceMultipart({
    url: '/api/v1/staff/verification-cases/case-123/basis-dossier/versions',
    metadata: { legalBasisType: 'NOTARIAL_PARTITION', issuingAuthority: 'VPCC' },
    file: validFile,
    token: 'jwt-staff-token',
    lang: 'vi',
    onProgress: (p) => progressEvents.push(p),
    onStatusChange: (status, msg) => statusEvents.push({ status, msg }),
    xhrFactory: () => mockXhr,
  });

  // Verify headers and initial state
  assert.equal(mockXhr.headers['Authorization'], 'Bearer jwt-staff-token');
  assert.equal(mockXhr.headers['Accept-Language'], 'vi');
  assert.equal(progressEvents[0].phase, 'uploading');
  assert.equal(progressEvents[0].percent, 0);

  // Simulate progress event at 50%
  mockXhr.upload.onprogress({
    lengthComputable: true,
    loaded: 500,
    total: 1000,
  });
  assert.equal(progressEvents[1].phase, 'uploading');
  assert.equal(progressEvents[1].percent, 50);
  assert.equal(progressEvents[1].indeterminate, false);

  // Simulate progress reaches 100% (network upload complete -> switch to indeterminate processing)
  mockXhr.upload.onprogress({
    lengthComputable: true,
    loaded: 1000,
    total: 1000,
  });
  const processingEvent = progressEvents[2];
  assert.equal(processingEvent.phase, 'processing');
  assert.equal(processingEvent.percent, 100);
  assert.equal(processingEvent.indeterminate, true);

  // Server completes processing and responds with 201 receipt
  mockXhr.status = 201;
  mockXhr.responseText = JSON.stringify({
    id: 'dossier-001',
    route: 'NOTARIAL',
    status: 'LEGAL_BASIS_PROVIDED',
    versions: [
      {
        version: 1,
        sha256: 'a1b2c3d4e5f6',
        contentType: 'application/pdf',
      },
    ],
  });
  mockXhr.onload();

  const result = await uploadPromise;
  assert.equal(result.id, 'dossier-001');
  assert.equal(result.versions[0].version, 1);
  assert.equal(result.versions[0].sha256, 'a1b2c3d4e5f6');

  // Verify success progress phase
  const lastProgress = progressEvents[progressEvents.length - 1];
  assert.equal(lastProgress.phase, 'success');
  assert.equal(lastProgress.indeterminate, false);
});

test('PS-98: uploadEvidenceMultipart respects AbortSignal and aborts in-flight request', async () => {
  const mockXhr = new MockXMLHttpRequest();
  const controller = new AbortController();

  const validFile = new File([new Uint8Array(500)], 'test.pdf', { type: 'application/pdf' });

  const uploadPromise = uploadEvidenceMultipart({
    url: '/api/v1/test',
    metadata: {},
    file: validFile,
    signal: controller.signal,
    xhrFactory: () => mockXhr,
  });

  // Trigger abort
  controller.abort();

  assert.equal(mockXhr.aborted, true);
  await assert.rejects(
    async () => {
      await uploadPromise;
    },
    (err) => {
      assert.equal(err.name, 'AbortError');
      assert.equal(err.code, 'ABORTED');
      return true;
    }
  );
});

test('PS-98: uploadEvidenceMultipart propagates structured backend error codes', async () => {
  const mockXhr = new MockXMLHttpRequest();
  const validFile = new File([new Uint8Array(500)], 'test.pdf', { type: 'application/pdf' });

  const uploadPromise = uploadEvidenceMultipart({
    url: '/api/v1/test',
    metadata: {},
    file: validFile,
    xhrFactory: () => mockXhr,
  });

  mockXhr.status = 409;
  mockXhr.responseText = JSON.stringify({
    code: 'BASIS_DOSSIER_INVALID_STATE',
    message: 'Hồ sơ đang ở trạng thái ON_HOLD.',
  });
  mockXhr.onload();

  await assert.rejects(
    async () => {
      await uploadPromise;
    },
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'BASIS_DOSSIER_INVALID_STATE');
      assert.equal(err.message, 'Hồ sơ đang ở trạng thái ON_HOLD.');
      return true;
    }
  );
});

test('PS-98: uploadEvidenceMultipart maps 413 and 415 HTTP status codes safely', async () => {
  // Test 413
  const mockXhr413 = new MockXMLHttpRequest();
  const file = new File([new Uint8Array(500)], 'test.pdf', { type: 'application/pdf' });

  const p413 = uploadEvidenceMultipart({
    url: '/api/v1/test',
    metadata: {},
    file,
    xhrFactory: () => mockXhr413,
  });
  mockXhr413.status = 413;
  mockXhr413.responseText = '';
  mockXhr413.onload();

  await assert.rejects(p413, (err) => {
    assert.equal(err.status, 413);
    assert.equal(err.code, 'PAYLOAD_TOO_LARGE');
    return true;
  });

  // Test 415
  const mockXhr415 = new MockXMLHttpRequest();
  const p415 = uploadEvidenceMultipart({
    url: '/api/v1/test',
    metadata: {},
    file,
    xhrFactory: () => mockXhr415,
  });
  mockXhr415.status = 415;
  mockXhr415.responseText = '';
  mockXhr415.onload();

  await assert.rejects(p415, (err) => {
    assert.equal(err.status, 415);
    assert.equal(err.code, 'UNSUPPORTED_MEDIA_TYPE');
    return true;
  });
});
