import test from 'node:test';
import { fileURLToPath } from 'node:url';
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

// --- F02 Real Component Mount & Render Tests (JSDOM / React / Vite Harness) ---
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const req = createRequire(import.meta.url);
const React = req('react');
const { act } = React;
const { createRoot } = req('react-dom/client');
const { JSDOM } = req('jsdom');
const { build } = await import(pathToFileURL(req.resolve('vite')).href);

const dom = new JSDOM('<body><div id="root"></div></body>', { url: 'http://localhost/staff/legal-documents' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const builtComponent = await build({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  configFile: false,
  logLevel: 'silent',
  build: {
    write: false,
    minify: false,
    lib: { entry: 'src/pages/staff/StaffLegalDocumentsPage.jsx', formats: ['es'] },
    rollupOptions: { external: ['react', 'react/jsx-runtime'] },
  },
});

let bundledCode = (Array.isArray(builtComponent) ? builtComponent[0] : builtComponent).output.find(x => x.type === 'chunk' && x.isEntry).code;
for (const name of ['react', 'react/jsx-runtime']) {
  bundledCode = bundledCode.replaceAll(`from "${name}"`, `from "${pathToFileURL(req.resolve(name)).href}"`);
}
const StaffLegalDocumentsPage = (await import('data:text/javascript;base64,' + Buffer.from(bundledCode).toString('base64'))).default;

const caseA = '11111111-1111-4111-8111-111111111111';
const caseB = '22222222-2222-4222-8222-222222222222';
const sessionA = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sessionB = 'bbbb2222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const jsonResponse = (val, status = 200) => new Response(JSON.stringify(val), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const defaultCaseItem = (id, overrides = {}) => ({
  caseId: id,
  caseNumber: 'TEST-' + id.slice(0, 4),
  status: 'CLOSED',
  vaultStatus: 'ARCHIVED',
  ...overrides,
});

const makeSessionItem = (cId, sId, status = 'COMPLETED') => ({
  caseId: cId,
  sessionId: sId,
  vaultId: cId,
  staffId: cId,
  status,
  openedAt: '2026-10-22T00:00:00Z',
  closedAt: status === 'OPEN' ? null : '2026-10-22T01:00:00Z',
});

async function mountComponentHelper() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);

  const render = async (props) => {
    await act(async () => {
      root.render(React.createElement(StaffLegalDocumentsPage, props));
      await new Promise(r => setTimeout(r, 80));
    });
    await act(async () => {
      await new Promise(r => setTimeout(r, 80));
    });
  };

  const getArchiveLink = () => {
    const link = [...host.querySelectorAll('a')].find(x => x.textContent.includes('Xem lưu trữ') || x.textContent.includes('View archive'));
    return link ? link.getAttribute('href') : null;
  };

  const clickArchiveLink = () => {
    const link = [...host.querySelectorAll('a')].find(x => x.textContent.includes('Xem lưu trữ') || x.textContent.includes('View archive'));
    if (!link) return null;
    return link.getAttribute('href');
  };

  const getSelect = () => host.querySelector('select#staff-historical-session-select');

  const selectSession = async (value) => {
    const select = host.querySelector('select#staff-historical-session-select');
    if (!select) return;
    await act(async () => {
      select.value = value;
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 40));
    });
    await act(async () => {
      await new Promise(r => setTimeout(r, 40));
    });
  };

  const getGuidance = () => {
    const span = [...host.querySelectorAll('span')].find(x =>
      x.textContent.includes('chọn phiên bàn giao') || x.textContent.includes('select a handover session')
    );
    return span ? span.textContent : null;
  };

  const unmount = async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  };

  const renderQuick = (props) => {
    act(() => {
      root.render(React.createElement(StaffLegalDocumentsPage, props));
    });
  };

  return { host, render, getArchiveLink, clickArchiveLink, getSelect, selectSession, getGuidance, unmount };
}

test('F02 Component 1: Case A có session A -> chuyển B không có session: link B tuyệt đối không chứa session A', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      if (url.includes(caseA)) {
        return jsonResponse([makeSessionItem(caseA, sessionA)]);
      }
      return jsonResponse([]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    const linkA = getArchiveLink();
    assert.ok(linkA?.includes(`caseId=${caseA}`));
    assert.ok(linkA?.includes(`sessionId=${sessionA}`));

    await render({ caseId: caseB, caseItem: defaultCaseItem(caseB), accessToken: 'token-1', lang: 'vi' });
    const linkB = getArchiveLink();
    assert.ok(linkB?.includes(`caseId=${caseB}`), `Expected linkB to contain caseB, got: ${linkB}`);
    assert.ok(!linkB?.includes(sessionA), `LEAK DETECTED! linkB must not contain sessionA (${sessionA}), got: ${linkB}`);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Component 2: B trả lỗi: session A không còn hiệu lực', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      if (url.includes(caseA)) {
        return jsonResponse([makeSessionItem(caseA, sessionA)]);
      }
      return jsonResponse({ code: 'INTERNAL_ERROR', message: 'Failed' }, 500);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    assert.ok(getArchiveLink()?.includes(sessionA));

    await render({ caseId: caseB, caseItem: defaultCaseItem(caseB), accessToken: 'token-1', lang: 'vi' });
    const linkB = getArchiveLink();
    assert.ok(linkB?.includes(`caseId=${caseB}`));
    assert.ok(!linkB?.includes(sessionA), `Error on B must not retain session A! Got: ${linkB}`);
    assert.ok(!linkB?.includes('sessionId='), `Link B should not have any sessionId on error! Got: ${linkB}`);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Component 3: A trả response muộn sau khi chuyển B: không ghi đè session của B (chứng minh abort/ignore)', async () => {
  const originalFetch = globalThis.fetch;
  let delayedResolveA = null;
  let abortedSignals = [];

  globalThis.fetch = async (url, init) => {
    if (url.includes('handover-sessions')) {
      if (init?.signal) {
        init.signal.addEventListener('abort', () => {
          abortedSignals.push(url);
        });
      }
      if (url.includes(caseA)) {
        return new Promise(resolve => {
          delayedResolveA = () => resolve(jsonResponse([makeSessionItem(caseA, sessionA)]));
        });
      }
      if (url.includes(caseB)) {
        return jsonResponse([makeSessionItem(caseB, sessionB)]);
      }
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    await render({ caseId: caseB, caseItem: defaultCaseItem(caseB), accessToken: 'token-1', lang: 'vi' });

    assert.ok(abortedSignals.some(u => u.includes(caseA)), 'Fetch signal for case A should have been aborted when switching to B');

    const linkBBefore = getArchiveLink();
    assert.ok(linkBBefore?.includes(sessionB), `Expected sessionB in link, got: ${linkBBefore}`);

    if (delayedResolveA) {
      await act(async () => {
        delayedResolveA();
        await new Promise(r => setTimeout(r, 80));
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 80));
      });
    }

    const linkBAfter = getArchiveLink();
    assert.ok(linkBAfter?.includes(`caseId=${caseB}`));
    assert.ok(linkBAfter?.includes(`sessionId=${sessionB}`));
    assert.ok(!linkBAfter?.includes(sessionA), `Late response from A must NOT overwrite B! Got: ${linkBAfter}`);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Component 4: B có session B: link chứa đúng case B và session B', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      if (url.includes(caseB)) {
        return jsonResponse([makeSessionItem(caseB, sessionB)]);
      }
      return jsonResponse([]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseB, caseItem: defaultCaseItem(caseB), accessToken: 'token-1', lang: 'vi' });
    const linkB = getArchiveLink();
    assert.equal(linkB, `/staff/close-and-archive?caseId=${encodeURIComponent(caseB)}&sessionId=${encodeURIComponent(sessionB)}`);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Component 5: Đổi access token trên cùng hồ sơ: kết quả của token cũ không được dùng lại', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (url.includes('handover-sessions')) {
      const authHeader = init?.headers?.Authorization || (typeof init?.headers?.get === 'function' ? init.headers.get('Authorization') : null);
      if (authHeader?.includes('token-1')) {
        return jsonResponse([makeSessionItem(caseA, sessionA)]);
      }
      return jsonResponse([]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    assert.ok(getArchiveLink()?.includes(sessionA));

    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-2', lang: 'vi' });
    const linkAfterTokenChange = getArchiveLink();
    assert.ok(!linkAfterTokenChange?.includes(sessionA), `Token switch must invalidate session from previous token! Got: ${linkAfterTokenChange}`);
    assert.equal(linkAfterTokenChange, `/staff/close-and-archive?caseId=${encodeURIComponent(caseA)}`);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Component 6: Rerender với metadata tương đương: số request tải dossier ổn định, không lặp theo render', async () => {
  const originalFetch = globalThis.fetch;
  let dossierFetchCount = 0;
  globalThis.fetch = async (url) => {
    if (url.includes('basis-dossier')) {
      dossierFetchCount++;
      return jsonResponse({
        caseId: caseA,
        status: 'LEGAL_BASIS_PROVIDED',
        latestVersion: { version: 1, basisType: 'COURT_JUDGMENT' },
        versions: [{ version: 1, basisType: 'COURT_JUDGMENT' }],
      });
    }
    if (url.includes('handover-sessions')) {
      return jsonResponse([makeSessionItem(caseA, sessionA)]);
    }
    if (url.includes('assets') || url.includes('beneficiaries')) {
      return jsonResponse({ content: [] });
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, unmount } = await mountComponentHelper();
  try {
    const caseItem1 = defaultCaseItem(caseA, { status: 'OPEN', vaultStatus: 'ACTIVE' });
    await render({ caseId: caseA, caseItem: caseItem1, accessToken: 'token-1', lang: 'vi' });
    const initialCount = dossierFetchCount;
    assert.ok(initialCount > 0, 'Dossier should be fetched on initial render');

    for (let i = 0; i < 5; i++) {
      const clonedCaseItem = { ...caseItem1 };
      await render({ caseId: caseA, caseItem: clonedCaseItem, accessToken: 'token-1', lang: 'vi' });
    }

    assert.equal(dossierFetchCount, initialCount, `Dossier fetch count should remain strictly stable (${initialCount}) across rerenders with equivalent metadata, but got ${dossierFetchCount}`);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Component 7: Bấm link thực tế được component render, kiểm tra case/session đích', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      return jsonResponse([makeSessionItem(caseA, sessionA)]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, clickArchiveLink, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    const clickedHref = clickArchiveLink();
    assert.ok(clickedHref, 'Archive link should be clickable');
    const parsedUrl = new URL(clickedHref, 'http://localhost');
    assert.equal(parsedUrl.pathname, '/staff/close-and-archive');
    assert.equal(parsedUrl.searchParams.get('caseId'), caseA);
    assert.equal(parsedUrl.searchParams.get('sessionId'), sessionA);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Ambiguous 1: Hai phiên COMPLETED -> dropdown trống, không có link điều hướng trước khi chọn', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      return jsonResponse([
        makeSessionItem(caseA, sessionA, 'COMPLETED'),
        makeSessionItem(caseA, sessionB, 'COMPLETED'),
      ]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getSelect, getArchiveLink, getGuidance, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    const select = getSelect();
    assert.ok(select, 'Dropdown select should be rendered when multiple sessions exist');
    assert.equal(select.value, '', 'Dropdown initial value must be empty (unselected)');
    assert.equal(getArchiveLink(), null, 'There must be NO active archive link before user selection');
    assert.ok(getGuidance(), 'Guidance message must instruct staff to select a session');
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Ambiguous 2: Chọn phiên A -> link chứa đúng caseId và session A', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      return jsonResponse([
        makeSessionItem(caseA, sessionA, 'COMPLETED'),
        makeSessionItem(caseA, sessionB, 'COMPLETED'),
      ]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getSelect, selectSession, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    await selectSession(sessionA);

    const select = getSelect();
    assert.equal(select.value, sessionA, 'Dropdown value should be sessionA');
    const link = getArchiveLink();
    assert.equal(link, `/staff/close-and-archive?caseId=${encodeURIComponent(caseA)}&sessionId=${encodeURIComponent(sessionA)}`);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Ambiguous 3: Đổi sang phiên B -> link chỉ chứa session B', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      return jsonResponse([
        makeSessionItem(caseA, sessionA, 'COMPLETED'),
        makeSessionItem(caseA, sessionB, 'COMPLETED'),
      ]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getSelect, selectSession, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    await selectSession(sessionA);
    assert.ok(getArchiveLink()?.includes(sessionA));

    await selectSession(sessionB);
    const select = getSelect();
    assert.equal(select.value, sessionB, 'Dropdown value should switch to sessionB');
    const link = getArchiveLink();
    assert.equal(link, `/staff/close-and-archive?caseId=${encodeURIComponent(caseA)}&sessionId=${encodeURIComponent(sessionB)}`);
    assert.ok(!link.includes(sessionA), 'Link must NOT retain sessionA after switching to sessionB');
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Ambiguous 4: Chọn lại mục trống -> không có session hiệu lực, link mất khả năng điều hướng; không fallback về A/B', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      return jsonResponse([
        makeSessionItem(caseA, sessionA, 'COMPLETED'),
        makeSessionItem(caseA, sessionB, 'COMPLETED'),
      ]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getSelect, selectSession, getArchiveLink, getGuidance, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    await selectSession(sessionA);
    assert.ok(getArchiveLink()?.includes(sessionA));

    // Deselect back to empty
    await selectSession('');
    const select = getSelect();
    assert.equal(select.value, '', 'Dropdown value should be empty');
    assert.equal(getArchiveLink(), null, 'Link must lose navigation capability and not fallback to sessionA or B');
    assert.ok(getGuidance(), 'Guidance message must be displayed again');
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Ambiguous 5: Giá trị không thuộc danh sách -> không tạo link hợp lệ', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      return jsonResponse([
        makeSessionItem(caseA, sessionA, 'COMPLETED'),
        makeSessionItem(caseA, sessionB, 'COMPLETED'),
      ]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, selectSession, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    await selectSession('non-existent-rogue-session-id');

    assert.equal(getArchiveLink(), null, 'Rogue session ID must NOT create a valid archive link');
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Ambiguous 6: Đổi hồ sơ hoặc token sau khi đã chọn -> lựa chọn cũ mất hiệu lực', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (url.includes('handover-sessions')) {
      const authHeader = init?.headers?.Authorization || (typeof init?.headers?.get === 'function' ? init.headers.get('Authorization') : null);
      if (url.includes(caseA) && authHeader?.includes('token-1')) {
        return jsonResponse([
          makeSessionItem(caseA, sessionA, 'COMPLETED'),
          makeSessionItem(caseA, sessionB, 'COMPLETED'),
        ]);
      }
      return jsonResponse([]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, selectSession, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    await selectSession(sessionA);
    assert.ok(getArchiveLink()?.includes(sessionA));

    // Switch case to B (no sessions)
    await render({ caseId: caseB, caseItem: defaultCaseItem(caseB), accessToken: 'token-1', lang: 'vi' });
    const linkB = getArchiveLink();
    assert.ok(!linkB?.includes(sessionA), 'Switching case must immediately invalidate previous selection');

    // Switch back to A but with token-2 (no sessions for token-2)
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-2', lang: 'vi' });
    const linkA2 = getArchiveLink();
    assert.ok(!linkA2?.includes(sessionA), 'Switching token must immediately invalidate previous selection');
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Ambiguous 7: Response cũ trả muộn -> không phục hồi lựa chọn cũ', async () => {
  const originalFetch = globalThis.fetch;
  let delayedResolveA = null;

  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      if (url.includes(caseA)) {
        return new Promise(resolve => {
          delayedResolveA = () => resolve(jsonResponse([
            makeSessionItem(caseA, sessionA, 'COMPLETED'),
            makeSessionItem(caseA, sessionB, 'COMPLETED'),
          ]));
        });
      }
      if (url.includes(caseB)) {
        return jsonResponse([makeSessionItem(caseB, sessionB, 'COMPLETED')]);
      }
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    await render({ caseId: caseB, caseItem: defaultCaseItem(caseB), accessToken: 'token-1', lang: 'vi' });

    const linkB = getArchiveLink();
    assert.ok(linkB?.includes(`caseId=${caseB}`), 'Link should belong to case B');
    assert.ok(linkB?.includes(`sessionId=${sessionB}`), 'Link should contain session B');

    // Late resolution from case A arrives now
    if (delayedResolveA) {
      await act(async () => {
        delayedResolveA();
        await new Promise(r => setTimeout(r, 60));
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 60));
      });
    }

    const linkBAfter = getArchiveLink();
    assert.ok(linkBAfter?.includes(`caseId=${caseB}`), 'Case B should remain unchanged');
    assert.ok(linkBAfter?.includes(`sessionId=${sessionB}`), 'Session B should remain unchanged');
    assert.ok(!linkBAfter?.includes(sessionA), 'Late response from A must NOT overwrite B');
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Ambiguous 8: Rerender metadata tương đương -> không tự chọn lại hoặc tạo vòng request', async () => {
  const originalFetch = globalThis.fetch;
  let sessionsFetchCount = 0;

  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      sessionsFetchCount++;
      return jsonResponse([
        makeSessionItem(caseA, sessionA, 'COMPLETED'),
        makeSessionItem(caseA, sessionB, 'COMPLETED'),
      ]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getSelect, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    const caseItem = defaultCaseItem(caseA);
    await render({ caseId: caseA, caseItem, accessToken: 'token-1', lang: 'vi' });

    const initialFetchCount = sessionsFetchCount;
    assert.equal(getSelect()?.value, '', 'Initially unselected');
    assert.equal(getArchiveLink(), null, 'Initially no link');

    for (let i = 0; i < 4; i++) {
      await render({ caseId: caseA, caseItem: { ...caseItem }, accessToken: 'token-1', lang: 'vi' });
    }

    assert.equal(getSelect()?.value, '', 'Remains unselected after rerenders');
    assert.equal(getArchiveLink(), null, 'Remains without link after rerenders');
    assert.equal(sessionsFetchCount, initialFetchCount, 'Sessions fetch count must remain stable, no loop');
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Ambiguous 9: Trường hợp một phiên và URL chỉ định session hợp lệ vẫn hoạt động theo quy tắc hiện có', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      return jsonResponse([
        makeSessionItem(caseA, sessionA, 'COMPLETED'),
      ]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getSelect, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    // 9a: Single completed session auto-picks as before
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    assert.equal(getSelect(), null, 'No dropdown needed for single session');
    assert.equal(getArchiveLink(), `/staff/close-and-archive?caseId=${encodeURIComponent(caseA)}&sessionId=${encodeURIComponent(sessionA)}`);

    // 9b: URL explicitly specifies propSessionId
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), sessionId: sessionB, accessToken: 'token-1', lang: 'vi' });
    assert.equal(getArchiveLink(), `/staff/close-and-archive?caseId=${encodeURIComponent(caseA)}&sessionId=${encodeURIComponent(sessionB)}`);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Mixed Clear 1: Một COMPLETED + một CANCELLED: xác nhận hành vi ban đầu theo quy tắc hiện có (tự chọn COMPLETED)', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      return jsonResponse([
        makeSessionItem(caseA, sessionA, 'COMPLETED'),
        makeSessionItem(caseA, sessionB, 'CANCELLED'),
      ]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getSelect, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    const select = getSelect();
    assert.ok(select, 'Dropdown should be rendered when multiple sessions exist');
    assert.equal(select.value, sessionA, 'Initial selection should auto-pick single COMPLETED session');
    const link = getArchiveLink();
    assert.equal(link, `/staff/close-and-archive?caseId=${encodeURIComponent(caseA)}&sessionId=${encodeURIComponent(sessionA)}`);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Mixed Clear 2: Chọn CANCELLED -> chọn mục trống: dropdown giữ trống, không có link điều hướng hoạt động', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      return jsonResponse([
        makeSessionItem(caseA, sessionA, 'COMPLETED'),
        makeSessionItem(caseA, sessionB, 'CANCELLED'),
      ]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getSelect, selectSession, getArchiveLink, getGuidance, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });

    // Select CANCELLED
    await selectSession(sessionB);
    assert.equal(getSelect()?.value, sessionB);
    assert.equal(getArchiveLink(), `/staff/close-and-archive?caseId=${encodeURIComponent(caseA)}&sessionId=${encodeURIComponent(sessionB)}`);

    // Select empty option ""
    await selectSession('');
    assert.equal(getSelect()?.value, '', 'Dropdown must stay empty after explicit clear');
    assert.equal(getArchiveLink(), null, 'Link must be disabled/removed after clear; NO fallback to COMPLETED session');
    assert.ok(getGuidance(), 'Guidance message must be displayed');
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Mixed Clear 3: Chọn COMPLETED -> chọn mục trống: kết quả tương tự', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      return jsonResponse([
        makeSessionItem(caseA, sessionA, 'COMPLETED'),
        makeSessionItem(caseA, sessionB, 'CANCELLED'),
      ]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getSelect, selectSession, getArchiveLink, getGuidance, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    // User explicitly selects COMPLETED
    await selectSession(sessionA);
    assert.equal(getSelect()?.value, sessionA);
    assert.ok(getArchiveLink()?.includes(sessionA));

    // User clears selection to ""
    await selectSession('');
    assert.equal(getSelect()?.value, '', 'Dropdown must stay empty');
    assert.equal(getArchiveLink(), null, 'Link must be disabled/removed; NO fallback to sessionA');
    assert.ok(getGuidance(), 'Guidance must be visible');
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Mixed Clear 4: Sau khi bỏ chọn, rerender nhiều lần với metadata tương đương: không phục hồi phiên hoặc phát sinh vòng request', async () => {
  const originalFetch = globalThis.fetch;
  let sessionsFetchCount = 0;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      sessionsFetchCount++;
      return jsonResponse([
        makeSessionItem(caseA, sessionA, 'COMPLETED'),
        makeSessionItem(caseA, sessionB, 'CANCELLED'),
      ]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getSelect, selectSession, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    const caseItem = defaultCaseItem(caseA);
    await render({ caseId: caseA, caseItem, accessToken: 'token-1', lang: 'vi' });
    assert.equal(getSelect()?.value, sessionA);

    // Clear selection
    await selectSession('');
    assert.equal(getSelect()?.value, '');
    assert.equal(getArchiveLink(), null);

    const countBeforeRerender = sessionsFetchCount;

    // Rerender 5 times with equivalent metadata
    for (let i = 0; i < 5; i++) {
      await render({ caseId: caseA, caseItem: { ...caseItem }, accessToken: 'token-1', lang: 'vi' });
    }

    assert.equal(getSelect()?.value, '', 'Remains empty across rerenders with equivalent metadata');
    assert.equal(getArchiveLink(), null, 'Link remains disabled across rerenders');
    assert.equal(sessionsFetchCount, countBeforeRerender, 'Fetch count remains stable, no loops');
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Mixed Clear 5: Đổi ngôn ngữ sau khi bỏ chọn: không tự chọn lại', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      return jsonResponse([
        makeSessionItem(caseA, sessionA, 'COMPLETED'),
        makeSessionItem(caseA, sessionB, 'CANCELLED'),
      ]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getSelect, selectSession, getArchiveLink, getGuidance, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    await selectSession('');
    assert.equal(getSelect()?.value, '');
    assert.equal(getArchiveLink(), null);

    // Switch lang to EN
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'en' });
    assert.equal(getSelect()?.value, '', 'Dropdown remains empty after language change');
    assert.equal(getArchiveLink(), null, 'Link remains disabled after language change');
    const guidanceEn = getGuidance();
    assert.ok(guidanceEn?.includes('Please select a handover session'), 'English guidance displayed');
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Mixed Clear 6: Sau khi bỏ chọn, chọn phiên hợp lệ lần nữa: link hoạt động với đúng case/session', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('handover-sessions')) {
      return jsonResponse([
        makeSessionItem(caseA, sessionA, 'COMPLETED'),
        makeSessionItem(caseA, sessionB, 'CANCELLED'),
      ]);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getSelect, selectSession, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    await selectSession('');
    assert.equal(getArchiveLink(), null);

    // Select session B
    await selectSession(sessionB);
    assert.equal(getSelect()?.value, sessionB);
    assert.equal(getArchiveLink(), `/staff/close-and-archive?caseId=${encodeURIComponent(caseA)}&sessionId=${encodeURIComponent(sessionB)}`);

    // Select session A
    await selectSession(sessionA);
    assert.equal(getSelect()?.value, sessionA);
    assert.equal(getArchiveLink(), `/staff/close-and-archive?caseId=${encodeURIComponent(caseA)}&sessionId=${encodeURIComponent(sessionA)}`);

    // Clear again
    await selectSession('');
    assert.equal(getSelect()?.value, '');
    assert.equal(getArchiveLink(), null);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('F02 Mixed Clear 7: Đổi hồ sơ/token hoặc response cũ trả muộn: không phục hồi phiên trước', async () => {
  const originalFetch = globalThis.fetch;
  let delayedResolveA = null;

  globalThis.fetch = async (url, init) => {
    if (url.includes('handover-sessions')) {
      const authHeader = init?.headers?.Authorization || (typeof init?.headers?.get === 'function' ? init.headers.get('Authorization') : null);
      if (url.includes(caseA) && authHeader?.includes('token-1')) {
        return new Promise(resolve => {
          delayedResolveA = () => resolve(jsonResponse([
            makeSessionItem(caseA, sessionA, 'COMPLETED'),
            makeSessionItem(caseA, sessionB, 'CANCELLED'),
          ]));
        });
      }
      if (url.includes(caseB)) {
        return jsonResponse([]);
      }
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  const { render, getArchiveLink, unmount } = await mountComponentHelper();
  try {
    await render({ caseId: caseA, caseItem: defaultCaseItem(caseA), accessToken: 'token-1', lang: 'vi' });
    // Switch to B before A resolves
    await render({ caseId: caseB, caseItem: defaultCaseItem(caseB), accessToken: 'token-1', lang: 'vi' });
    const linkB = getArchiveLink();
    assert.ok(!linkB?.includes(sessionA));
    assert.ok(!linkB?.includes(sessionB));

    // A resolves late
    if (delayedResolveA) {
      await act(async () => {
        delayedResolveA();
        await new Promise(r => setTimeout(r, 60));
      });
      await act(async () => {
        await new Promise(r => setTimeout(r, 60));
      });
    }

    const linkBAfter = getArchiveLink();
    assert.ok(!linkBAfter?.includes(sessionA), 'Late response from A must not resurrect session on B');
    assert.ok(!linkBAfter?.includes(sessionB));
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});
test('Legal Banners: ON_HOLD with real BE response (route ON_HOLD, routeReason null) shows neutral explanation', async () => {
  const originalFetch = globalThis.fetch;
  const onHoldCaseId = '11111111-1111-4111-8111-111111111111';

  const mockFetch = async (url) => {
    const urlStr = String(url || '');
    if (urlStr.includes('basis-dossier')) {
      return jsonResponse({
        id: 'dossier-on-hold-01',
        caseId: onHoldCaseId,
        route: 'ON_HOLD',
        status: 'DRAFT',
        disputeStatus: 'DISPUTED',
        routeReason: null,
        classifiedBy: '00000000-0000-4000-8000-000000000001',
        createdAt: '2026-10-20T00:00:00Z',
        updatedAt: '2026-10-20T00:00:00Z',
        requiredVersion: 1,
        versions: [],
      });
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  globalThis.fetch = mockFetch;

  const { render, host, unmount } = await mountComponentHelper();
  try {
    await render({
      caseId: onHoldCaseId,
      caseItem: defaultCaseItem(onHoldCaseId, { status: 'OPEN', vaultStatus: 'ON_HOLD' }),
      accessToken: 'test-token',
      lang: 'vi',
    });

    const holdBanner = host.querySelector('.lv-dossier-hold-banner');
    assert.ok(holdBanner, 'ON_HOLD banner must be rendered');
    assert.match(holdBanner.textContent, /TẠM DỪNG/i);
    // Real BE sends routeReason: null to Staff, UI must render neutral guidance without throwing
    assert.match(holdBanner.textContent, /quyết định của Ban Pháp lý/i);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('Legal Banners: Supplementation required by real BE (requiredVersion > latest version) shows version requirement', async () => {
  const originalFetch = globalThis.fetch;
  const suppCaseId = '33333333-3333-4333-8333-333333333333';

  const mockFetch = async (url) => {
    const urlStr = String(url || '');
    if (urlStr.includes('basis-dossier')) {
      return jsonResponse({
        id: 'dossier-supp-01',
        caseId: suppCaseId,
        route: 'COURT',
        status: 'LEGAL_BASIS_PROVIDED',
        disputeStatus: 'NONE',
        routeReason: null,
        requiredVersion: 2,
        versions: [
          {
            version: 1,
            legalBasisType: 'COURT_JUDGMENT',
            issuingAuthority: 'TAND TP. Hà Nội',
            documentNumber: '01/2026/QĐ-ST',
            issueDate: '2026-10-10',
            notes: 'Intake version 1',
            forwardStatus: 'FORWARDED',
            current: true,
            allocations: [],
          },
        ],
      });
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  globalThis.fetch = mockFetch;

  const { render, host, unmount } = await mountComponentHelper();
  try {
    await render({
      caseId: suppCaseId,
      caseItem: defaultCaseItem(suppCaseId, { status: 'OPEN', vaultStatus: 'AWAITING_LEGAL_BASIS' }),
      accessToken: 'test-token',
      lang: 'vi',
    });

    const banners = host.querySelectorAll('.lv-dossier-hold-banner');
    const suppBanner = [...banners].find(b => b.textContent.includes('yêu cầu bổ sung') || b.textContent.includes('CHANGES_REQUESTED'));
    assert.ok(suppBanner, 'Supplementation banner must be rendered when requiredVersion > latestVersion');
    assert.match(suppBanner.textContent, /phiên bản hồ sơ số 2/i);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('Legal Banners: 403 Forbidden clears dossier and shows authorization error without broken banner', async () => {
  const originalFetch = globalThis.fetch;
  const forbiddenCaseId = '44444444-4444-4444-8444-444444444444';

  const mockFetch = async (url) => {
    const urlStr = String(url || '');
    if (urlStr.includes('basis-dossier')) {
      return jsonResponse({ code: 'ACCESS_DENIED', message: 'Tài khoản không có quyền truy cập hồ sơ này.' }, 403);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  globalThis.fetch = mockFetch;

  const { render, host, unmount } = await mountComponentHelper();
  try {
    await render({
      caseId: forbiddenCaseId,
      caseItem: defaultCaseItem(forbiddenCaseId, { status: 'OPEN', vaultStatus: 'AWAITING_LEGAL_BASIS' }),
      accessToken: 'test-token',
      lang: 'vi',
    });

    const errorEl = host.querySelector('.lv-form-error-banner, [role="alert"]');
    assert.ok(errorEl, 'Error banner must be present on 403');
    assert.match(errorEl.textContent, /không có quyền|thất bại|failed/i);
    // Banners for hold/reject should NOT be rendered
    assert.equal(host.querySelector('.lv-dossier-hold-banner'), null);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('Legal Banners: Switching case discards late response from previous case', async () => {
  const originalFetch = globalThis.fetch;
  const caseX = '55555555-5555-4555-8555-555555555555';
  const caseY = '66666666-6666-4666-8666-666666666666';
  let delayedResolveX = null;

  const mockFetch = async (url) => {
    const urlStr = String(url || '');
    if (urlStr.includes('basis-dossier')) {
      if (urlStr.includes(caseX)) {
        return new Promise((resolve) => {
          delayedResolveX = () => resolve(jsonResponse({
            id: 'dossier-x',
            caseId: caseX,
            route: 'ON_HOLD',
            status: 'DRAFT',
            disputeStatus: 'DISPUTED',
            routeReason: null,
            requiredVersion: 1,
            versions: [],
          }));
        });
      }
      if (urlStr.includes(caseY)) {
        return jsonResponse({
          id: 'dossier-y',
          caseId: caseY,
          route: 'COURT',
          status: 'DRAFT',
          disputeStatus: 'NONE',
          routeReason: null,
          requiredVersion: 1,
          versions: [
            { version: 1, current: true, fileName: 'caseY-court-basis.pdf', createdAt: '2026-10-20T00:00:00Z' },
          ],
        });
      }
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  globalThis.fetch = mockFetch;

  const { render, host, unmount } = await mountComponentHelper();
  try {
    await render({
      caseId: caseX,
      caseItem: defaultCaseItem(caseX, { status: 'OPEN', vaultStatus: 'ON_HOLD' }),
      accessToken: 'test-token',
      lang: 'vi',
    });

    await render({
      caseId: caseY,
      caseItem: defaultCaseItem(caseY, { status: 'OPEN', vaultStatus: 'AWAITING_LEGAL_BASIS' }),
      accessToken: 'test-token',
      lang: 'vi',
    });

    if (delayedResolveX) {
      await act(async () => {
        delayedResolveX();
        await new Promise((r) => setTimeout(r, 60));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });
    }

    const holdBanner = host.querySelector('.lv-dossier-hold-banner');
    assert.equal(holdBanner, null, 'Late ON_HOLD response from caseX must not leak to caseY');
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});


test('Legal Banners: Initial intake (DRAFT, requiredVersion=1, versions=[]) does not show supplementation banner', async () => {
  const originalFetch = globalThis.fetch;
  const initialCaseId = '77777777-7777-4777-8777-777777777777';

  const mockFetch = async (url) => {
    const urlStr = String(url || '');
    if (urlStr.includes('basis-dossier')) {
      return jsonResponse({
        id: 'dossier-initial-01',
        caseId: initialCaseId,
        route: 'COURT',
        status: 'DRAFT',
        disputeStatus: 'NONE',
        routeReason: null,
        requiredVersion: 1,
        versions: [],
      });
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  globalThis.fetch = mockFetch;

  const { render, host, unmount } = await mountComponentHelper();
  try {
    await render({
      caseId: initialCaseId,
      caseItem: defaultCaseItem(initialCaseId, { status: 'OPEN', vaultStatus: 'AWAITING_LEGAL_BASIS' }),
      accessToken: 'test-token',
      lang: 'vi',
    });

    const suppBanner = host.querySelector('.lv-dossier-supplement-banner');
    assert.equal(suppBanner, null, 'Initial intake must NOT show supplementation banner');
    assert.equal(host.textContent.includes('yêu cầu bổ sung'), false, 'Initial intake must not mention supplementation');
    assert.equal(host.textContent.includes('CHANGES_REQUESTED'), false, 'Initial intake must not mention CHANGES_REQUESTED');
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('Legal Banners: ON_HOLD blocks upload actions and does NOT guide upload/supplementation', async () => {
  const originalFetch = globalThis.fetch;
  const heldCaseId = '88888888-8888-4888-8888-888888888888';

  const mockFetch = async (url) => {
    const urlStr = String(url || '');
    if (urlStr.includes('basis-dossier')) {
      return jsonResponse({
        id: 'dossier-held-01',
        caseId: heldCaseId,
        route: 'ON_HOLD',
        status: 'DRAFT',
        disputeStatus: 'DISPUTED',
        routeReason: null,
        requiredVersion: 2,
        versions: [
          { version: 1, forwardStatus: 'FORWARDED', current: true, fileName: 'v1.pdf' }
        ],
      });
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  globalThis.fetch = mockFetch;

  const { render, host, unmount } = await mountComponentHelper();
  try {
    await render({
      caseId: heldCaseId,
      caseItem: defaultCaseItem(heldCaseId, { status: 'OPEN', vaultStatus: 'ON_HOLD' }),
      accessToken: 'test-token',
      lang: 'vi',
    });

    // 1. Hold banner is shown
    const holdBanner = host.querySelector('.lv-dossier-hold-banner');
    assert.ok(holdBanner, 'Hold banner must be shown for ON_HOLD');
    assert.match(holdBanner.textContent, /TẠM DỪNG|tạm giữ/i);

    // 2. Supplementation banner is NOT shown
    const suppBanner = host.querySelector('.lv-dossier-supplement-banner');
    assert.equal(suppBanner, null, 'Supplementation banner must NOT be shown when ON_HOLD');
    assert.equal(host.textContent.includes('Ban Pháp lý yêu cầu bổ sung'), false);

    // 3. Form select is disabled
    const select = host.querySelector('#staff-legal-doc-type');
    if (select) {
      assert.equal(select.disabled, true, 'Form select must be disabled when ON_HOLD');
    }
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('Legal Banners: Dossier with lack of rejection API data does NOT assert rejection', async () => {
  const originalFetch = globalThis.fetch;
  const noRejectCaseId = '99999999-9999-4999-8999-999999999999';

  const mockFetch = async (url) => {
    const urlStr = String(url || '');
    if (urlStr.includes('basis-dossier')) {
      return jsonResponse({
        id: 'dossier-no-reject-01',
        caseId: noRejectCaseId,
        route: 'COURT',
        status: 'DRAFT',
        disputeStatus: 'DISPUTED',
        routeReason: null,
        requiredVersion: 1,
        versions: [],
      });
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  globalThis.fetch = mockFetch;

  const { render, host, unmount } = await mountComponentHelper();
  try {
    await render({
      caseId: noRejectCaseId,
      caseItem: defaultCaseItem(noRejectCaseId, { status: 'OPEN', vaultStatus: 'AWAITING_LEGAL_BASIS' }),
      accessToken: 'test-token',
      lang: 'vi',
    });

    assert.equal(host.textContent.includes('Hồ sơ căn cứ đã bị Ban Pháp lý từ chối'), false);
    assert.equal(host.textContent.includes('từ chối (REJECTED)'), false);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});

test('Legal Banners: 401 Unauthorized clears dossier and shows session error banner', async () => {
  const originalFetch = globalThis.fetch;
  const unauthCaseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const mockFetch = async (url) => {
    const urlStr = String(url || '');
    if (urlStr.includes('basis-dossier')) {
      return jsonResponse({ code: 'UNAUTHORIZED', message: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.' }, 401);
    }
    return jsonResponse({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };

  globalThis.fetch = mockFetch;

  const { render, host, unmount } = await mountComponentHelper();
  try {
    await render({
      caseId: unauthCaseId,
      caseItem: defaultCaseItem(unauthCaseId, { status: 'OPEN', vaultStatus: 'AWAITING_LEGAL_BASIS' }),
      accessToken: 'expired-token',
      lang: 'vi',
    });

    const errorEl = host.querySelector('.lv-form-error-banner, [role="alert"]');
    assert.ok(errorEl, 'Error banner must be shown on 401');
    assert.match(errorEl.textContent, /hết hạn/i);
    assert.equal(host.querySelector('.lv-dossier-hold-banner'), null);
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});
