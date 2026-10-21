import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateEvidenceFile,
  formatFileSize,
  uploadEvidenceMultipart,
  validateIntakeAttachmentReceipt,
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

test('PS-98/PS-103: validateIntakeAttachmentReceipt validates strict backend contract', () => {
  const caseId = '12345678-1234-4234-8234-123456789012';
  const recordId = '87654321-4321-4321-8321-210987654321';
  const attId = '11111111-2222-4333-8444-555555555555';
  const userId = '99999999-8888-4777-8666-555555555555';

  const validReceipt = {
    id: attId,
    caseId,
    subjectType: 'DEATH_DOCUMENT',
    subjectId: recordId,
    uploadedBy: userId,
    fileName: 'death_cert.pdf',
    sizeBytes: 2048,
    contentType: 'application/pdf',
    sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    uploadedAt: '2026-10-21T10:00:00Z',
  };

  const validated = validateIntakeAttachmentReceipt(validReceipt, {
    caseId,
    kind: 'death-documents',
    recordId,
  });
  assert.equal(validated.id, attId);
  for (const patch of [
    { sha256: 'z'.repeat(64) }, { sizeBytes: undefined }, { sizeBytes: 0 },
    { sizeBytes: -1 }, { sizeBytes: 1.5 }, { sizeBytes: '2048' },
    { contentType: undefined }, { contentType: 'text/html' },
  ]) {
    assert.throws(() => validateIntakeAttachmentReceipt({ ...validReceipt, ...patch }, {
      caseId, kind: 'death-documents', recordId,
    }), { code: 'INVALID_RECEIPT' });
  }

  // Mismatched caseId throws INVALID_RECEIPT
  assert.throws(
    () => validateIntakeAttachmentReceipt(validReceipt, { caseId: '11111111-1111-4111-8111-111111111111', kind: 'death-documents', recordId }),
    { code: 'INVALID_RECEIPT' }
  );

  // Mismatched recordId throws INVALID_RECEIPT
  assert.throws(
    () => validateIntakeAttachmentReceipt(validReceipt, { caseId, kind: 'death-documents', recordId: '22222222-2222-4222-8222-222222222222' }),
    { code: 'INVALID_RECEIPT' }
  );

  // Mismatched kind/subjectType throws INVALID_RECEIPT
  assert.throws(
    () => validateIntakeAttachmentReceipt(validReceipt, { caseId, kind: 'original-will-intakes', recordId }),
    { code: 'INVALID_RECEIPT' }
  );

  // Invalid SHA-256 (not 64 hex chars) throws INVALID_RECEIPT
  assert.throws(
    () => validateIntakeAttachmentReceipt({ ...validReceipt, sha256: 'short-sha' }, { caseId, kind: 'death-documents', recordId }),
    { code: 'INVALID_RECEIPT' }
  );

  // Missing or non-UUID id throws INVALID_RECEIPT
  assert.throws(
    () => validateIntakeAttachmentReceipt({ ...validReceipt, id: 'bad-id' }, { caseId, kind: 'death-documents', recordId }),
    { code: 'INVALID_RECEIPT' }
  );
});

test('PS-98/PS-103: uploadEvidenceMultipart supports file-only multipart without metadata part', async () => {
  const mockXhr = new MockXMLHttpRequest();
  const file = new File([new Uint8Array(100)], 'attachment.pdf', { type: 'application/pdf' });

  const uploadPromise = uploadEvidenceMultipart({
    url: '/api/v1/staff/verification-cases/case-123/death-documents/rec-456/attachments',
    file,
    xhrFactory: () => mockXhr,
  });

  assert.ok(mockXhr.sentData instanceof FormData);
  assert.equal(mockXhr.sentData.has('file'), true);
  assert.equal(mockXhr.sentData.has('metadata'), false);

  mockXhr.status = 201;
  mockXhr.responseText = JSON.stringify({
    id: 'att-001',
    caseId: 'case-123',
    subjectType: 'DEATH_DOCUMENT',
    subjectId: 'rec-456',
    fileName: 'attachment.pdf',
    sizeBytes: 100,
    contentType: 'application/pdf',
    sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    createdAt: '2026-10-21T10:00:00Z',
  });
  mockXhr.onload();

  const receipt = await uploadPromise;
  assert.equal(receipt.id, 'att-001');
  assert.equal(receipt.fileName, 'attachment.pdf');
});
