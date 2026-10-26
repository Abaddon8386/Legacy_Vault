import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canAccessStaffLegalDocuments,
  resolvePostLoginRoute,
  validateStaffLegalDocumentForm,
  getStaffLegalDocumentErrorMessage,
} from './staffLegalDocumentsValidation.js';
import {
  fetchBasisDossier,
  uploadBasisVersion,
  forwardBasisVersion,
  readBasisVersionContent,
  SYNTHETIC_DOSSIERS,
} from '../pages/staff/staffLegalDocumentsService.js';
import { staffLegalDocumentsI18n } from '../pages/staff/staffLegalDocumentsI18n.js';

test('PS-96: canAccessStaffLegalDocuments strictly requires active session and STAFF_EXECUTOR role', () => {
  assert.equal(canAccessStaffLegalDocuments(null), false);
  assert.equal(canAccessStaffLegalDocuments({}), false);

  // Expired session
  const expiredSession = {
    accessToken: 'token-123',
    expiresAt: Date.now() - 1000,
    user: { roles: ['STAFF_EXECUTOR'] },
  };
  assert.equal(canAccessStaffLegalDocuments(expiredSession), false);

  // Wrong role (LEGAL_VERIFIER only)
  const legalSession = {
    accessToken: 'token-123',
    expiresAt: Date.now() + 60000,
    user: { roles: ['LEGAL_VERIFIER'] },
  };
  assert.equal(canAccessStaffLegalDocuments(legalSession), false);

  // Valid STAFF_EXECUTOR
  const validStaffSession = {
    accessToken: 'token-123',
    expiresAt: Date.now() + 60000,
    user: { roles: ['STAFF_EXECUTOR'] },
  };
  assert.equal(canAccessStaffLegalDocuments(validStaffSession), true);
});

test('PS-96: resolvePostLoginRoute directs pure Staff to /staff/legal-documents', () => {
  assert.equal(resolvePostLoginRoute({ roles: ['STAFF_EXECUTOR'] }), '/staff/legal-documents');
  assert.equal(resolvePostLoginRoute({ roles: ['LEGAL_VERIFIER'] }), '/legal/death-verification');
  assert.equal(resolvePostLoginRoute({ roles: ['VAULT_OWNER', 'STAFF_EXECUTOR'] }), '/vault');
  assert.equal(resolvePostLoginRoute({ roles: ['BENEFICIARY'] }), '/beneficiary');
});

test('PS-96: validateStaffLegalDocumentForm validates required fields, future dates, notary details, and evidence file', () => {
  // Empty form
  const emptyRes = validateStaffLegalDocumentForm({}, { lang: 'vi', requireFile: true });
  assert.equal(emptyRes.isValid, false);
  assert.equal(emptyRes.errors.issuer, 'issuerRequired');
  assert.equal(emptyRes.errors.documentNumber, 'documentNumberRequired');
  assert.equal(emptyRes.errors.issuanceDate, 'issuanceDateRequired');
  assert.equal(emptyRes.errors.file, 'fileRequired');

  // Future date rejection
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const futureDateRes = validateStaffLegalDocumentForm({
    issuer: 'VPCC Thăng Long',
    documentNumber: '123/CC',
    issuanceDate: tomorrow,
    legalBasisType: 'COURT_JUDGMENT',
    file: new File([new Uint8Array(100)], 'judgment.pdf', { type: 'application/pdf' }),
  }, { lang: 'vi', requireFile: true });
  assert.equal(futureDateRes.isValid, false);
  assert.equal(futureDateRes.errors.issuanceDate, 'issuanceDateInvalid');

  // Notarial partition requires notary organization, number, and valid date
  const missingNotaryRes = validateStaffLegalDocumentForm({
    issuer: 'VPCC Thăng Long',
    documentNumber: '123/CC',
    issuanceDate: '2026-10-10',
    legalBasisType: 'NOTARIAL_PARTITION',
    notaryAuthority: '',
    file: new File([new Uint8Array(100)], 'partition.pdf', { type: 'application/pdf' }),
  }, { lang: 'vi', requireFile: true });
  assert.equal(missingNotaryRes.isValid, false);
  assert.equal(missingNotaryRes.errors.notary, 'notaryRequired');

  // Complete valid NOTARIAL_PARTITION
  const validNotarialRes = validateStaffLegalDocumentForm({
    issuer: 'VPCC Thăng Long',
    documentNumber: '123/CC',
    issuanceDate: '2026-10-10',
    legalBasisType: 'NOTARIAL_PARTITION',
    notaryAuthority: 'VPCC Thăng Long',
    notarialDocumentNumber: '123/CC',
    notarizedAt: '2026-10-10',
    file: new File([new Uint8Array(100)], 'partition.pdf', { type: 'application/pdf' }),
  }, { lang: 'vi', requireFile: true });
  assert.equal(validNotarialRes.isValid, true);
  assert.deepEqual(validNotarialRes.errors, {});

  // Complete valid COURT_JUDGMENT does not require notary fields
  const validCourtRes = validateStaffLegalDocumentForm({
    issuer: 'TAND TP. Hà Nội',
    documentNumber: '45/2026/QĐ-TA',
    issuanceDate: '2026-10-10',
    legalBasisType: 'COURT_JUDGMENT',
    file: new File([new Uint8Array(100)], 'judgment.pdf', { type: 'application/pdf' }),
  }, { lang: 'vi', requireFile: true });
  assert.equal(validCourtRes.isValid, true);
  assert.deepEqual(validCourtRes.errors, {});
});

test('PS-96: fetchBasisDossier loads dossier and detects not-found state in simulation', async () => {
  // Existing notarial case (dùng case-notarial đích danh)
  const notarialRes = await fetchBasisDossier('case-notarial', { isDevPreview: true, isTest: true });
  assert.equal(notarialRes.notFound, false);
  assert.equal(notarialRes.dossier.route, 'NOTARIAL');
  assert.equal(notarialRes.dossier.status, 'LEGAL_BASIS_PROVIDED');
  assert.equal(notarialRes.dossier.versions.length, 1);
  assert.equal(notarialRes.dossier.versions[0].current, true);

  // Default COURT simulation
  const courtRes = await fetchBasisDossier('case-court', { isDevPreview: true, isTest: true });
  assert.equal(courtRes.notFound, false);
  assert.equal(courtRes.dossier.route, 'COURT');

  // Case with no dossier yet (Legal has not classified)
  const notFoundRes = await fetchBasisDossier('case-not-found', { isDevPreview: true, isTest: true });
  assert.equal(notFoundRes.notFound, true);
  assert.equal(notFoundRes.dossier, null);

  // Abort handling
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    async () => {
      await fetchBasisDossier('case-standard', { isDevPreview: true, signal: controller.signal });
    },
    (err) => {
      assert.equal(err.name, 'AbortError');
      return true;
    }
  );
});

test('PS-96: uploadBasisVersion returns new dossier version and hash receipt', async () => {
  const file = new File([new Uint8Array(1024)], 'evidence.pdf', { type: 'application/pdf' });
  const metadata = {
    legalBasisType: 'NOTARIAL_PARTITION',
    issuingAuthority: 'VPCC Thăng Long',
    documentNumber: '118/2026/VB-CC',
    issueDate: '2026-10-15',
    notaryAuthority: 'VPCC Thăng Long',
    notarialDocumentNumber: '118/2026/VB-CC',
    notarizedAt: '2026-10-15',
  };

  const progressEvents = [];
  const result = await uploadBasisVersion('6f1a4c2d-0000-4000-8000-000000000001', { metadata, file }, {
    isDevPreview: true,
    isTest: true,
    onProgress: (p) => progressEvents.push(p),
  });

  assert.equal(result.status, 'LEGAL_BASIS_PROVIDED');
  assert.equal(result.versions.length, 1);
  assert.equal(result.versions[0].version, 1);
  assert.ok(result.versions[0].sha256);
  assert.equal(result.versions[0].forwardStatus, 'NOT_FORWARDED');
  assert.ok(progressEvents.some((p) => p.phase === 'processing'));
});

test('PS-96: forwardBasisVersion updates dossier status to LEGAL_BASIS_FORWARDED', async () => {
  const result = await forwardBasisVersion('6f1a4c2d-0000-4000-8000-000000000001', 1, {
    isDevPreview: true,
    isTest: true,
  });

  assert.equal(result.status, 'LEGAL_BASIS_FORWARDED');
  assert.equal(result.versions[0].forwardStatus, 'FORWARDED');
  assert.ok(result.versions[0].forwardedAt);
});

test('PS-96: staffLegalDocumentsI18n contains all key bilingual strings without missing keys', () => {
  const requiredKeys = [
    'pageTitle',
    'formSubtitle',
    'staffNoticeTitle',
    'staffNoticeBody',
    'caseSelectTitle',
    'dossierSectionTitle',
    'btnForwardToLegal',
    'btnSubmitVersion',
    'awaitingLegalDossierTitle',
    'dossierOnHoldTitle',
    'dossierAlreadyForwardedNotice',
    'routeNotarial',
    'routeCourt',
    'statusDraft',
    'statusProvided',
    'statusForwarded',
  ];

  for (const key of requiredKeys) {
    assert.ok(staffLegalDocumentsI18n.vi[key], `Missing VI key: ${key}`);
    assert.ok(staffLegalDocumentsI18n.en[key], `Missing EN key: ${key}`);
  }
});

test('PS-96/PS-103: readBasisVersionContent returns simulated Blob in Dev Preview', async () => {
  const blob = await readBasisVersionContent('case-court', 1, { isDevPreview: true });
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, 'application/pdf');
  const text = await blob.text();
  assert.match(text, /Simulated COURT Basis Document Content/);
});

test('PS-96/PS-103: readBasisVersionContent calls real endpoint in live session', async () => {
  const calls = [];
  const testBlob = new Blob(['live-court-pdf'], { type: 'application/pdf' });
  const options = {
    isDevPreview: false,
    session: { accessToken: 'live-staff-token' },
    fetchFn: async (url, init) => {
      calls.push({ url, init });
      return new Response(testBlob, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
    },
  };
  const blob = await readBasisVersionContent('12345678-1234-4234-8234-123456789012', 1, options);
  assert.ok(blob instanceof Blob);
  assert.equal(calls[0].url, '/api/v1/staff/verification-cases/12345678-1234-4234-8234-123456789012/basis-dossier/versions/1/content');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer live-staff-token');
});

test('PS-96/PS-118: fetchStaffAssetCatalog requests pre-unlock catalog and maps items using PageResponse.content', async () => {
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      content: [
        { assetId: '11111111-1111-4111-8111-111111111111', assetType: 'REAL_ESTATE', name: 'Landmark 81 Apartment' },
      ],
      page: 0,
      size: 100,
      totalElements: 1,
      totalPages: 1,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const assets = await { ...await import('../pages/staff/staffLegalDocumentsService.js') }.fetchStaffAssetCatalog(
      'case-123',
      { accessToken: 'test-token', lang: 'vi' }
    );
    assert.equal(calls[0].url, '/api/v1/staff/verification-cases/case-123/assets?page=0&size=100');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token');
    assert.equal(assets.length, 1);
    assert.equal(assets[0].name, 'Landmark 81 Apartment');
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('PS-96/PS-118: fetchStaffAssetCatalog fetches all pages beyond 100 items when totalPages > 1', async () => {
  const oldFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (url, init) => {
    requestedUrls.push(url);
    const parsedUrl = new URL(url, 'http://localhost');
    const page = parseInt(parsedUrl.searchParams.get('page'), 10);
    if (page === 0) {
      return new Response(JSON.stringify({
        content: Array.from({ length: 100 }, (_, i) => ({
          assetId: `asset-page-0-${i}`,
          assetType: 'REAL_ESTATE',
          name: `Property #${i + 1}`,
        })),
        page: 0,
        size: 100,
        totalElements: 105,
        totalPages: 2,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      content: Array.from({ length: 5 }, (_, i) => ({
        assetId: `asset-page-1-${i + 100}`,
        assetType: 'BANK_ACCOUNT',
        name: `Bank Account #${i + 101}`,
      })),
      page: 1,
      size: 100,
      totalElements: 105,
      totalPages: 2,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const assets = await { ...await import('../pages/staff/staffLegalDocumentsService.js') }.fetchStaffAssetCatalog(
      'case-large',
      { accessToken: 'test-token', lang: 'vi', fetchAll: true }
    );
    assert.equal(requestedUrls.length, 2);
    assert.match(requestedUrls[0], /page=0&size=100/);
    assert.match(requestedUrls[1], /page=1&size=100/);
    assert.equal(assets.length, 105);
    assert.equal(assets[104].name, 'Bank Account #105');
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('PS-96/PS-118: fetchStaffAssetCatalog does not convert 404 or invalid responses to empty array', async () => {
  const oldFetch = globalThis.fetch;
  try {
    // 404 response
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 'RESOURCE_NOT_FOUND', message: 'Case not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
    await assert.rejects(
      async () => {
        await { ...await import('../pages/staff/staffLegalDocumentsService.js') }.fetchStaffAssetCatalog('invalid-case', {
          accessToken: 'token',
        });
      },
      (err) => {
        assert.equal(err.status, 404);
        assert.equal(err.code, 'RESOURCE_NOT_FOUND');
        return true;
      }
    );

    // Invalid response body (items instead of content or missing array)
    globalThis.fetch = async () => new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    await assert.rejects(
      async () => {
        await { ...await import('../pages/staff/staffLegalDocumentsService.js') }.fetchStaffAssetCatalog('case-invalid-shape', {
          accessToken: 'token',
        });
      },
      (err) => {
        assert.equal(err.code, 'INVALID_RESPONSE');
        return true;
      }
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('PS-96/PS-88: fetchStaffCaseBeneficiaries requests beneficiaries and returns array', async () => {
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify([
      { beneficiaryId: '22222222-2222-4222-8222-222222222222', fullName: 'Nguyen Van B', relationship: 'Con trai' },
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const bens = await { ...await import('../pages/staff/staffLegalDocumentsService.js') }.fetchStaffCaseBeneficiaries(
      'case-123',
      { accessToken: 'test-token', lang: 'vi' }
    );
    assert.equal(calls[0].url, '/api/v1/staff/verification-cases/case-123/beneficiaries');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token');
    assert.equal(bens.length, 1);
    assert.equal(bens[0].fullName, 'Nguyen Van B');
  } finally {
    globalThis.fetch = oldFetch;
  }
});
