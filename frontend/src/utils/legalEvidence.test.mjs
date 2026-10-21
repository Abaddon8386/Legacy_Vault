import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import { listLegalEvidence, readLegalEvidence } from '../pages/legal/legalEvidenceService.js';

// Synthetic bytes and HTTP fixtures are test-only; they are not legal records or runtime fallback data.
const caseId = '11111111-1111-4111-8111-111111111111', subjectId = '22222222-2222-4222-8222-222222222222';
const fileId = '33333333-3333-4333-8333-333333333333', now = '2026-10-21T10:00:00Z';
const bytes = new TextEncoder().encode('%PDF-fixture-only');
const digest = createHash('sha256').update(bytes).digest('hex');
const subject = { kind: 'death', caseId, subjectId };
const meta = (kind = 'death') => ({ id: fileId, caseId, subjectId, subjectType: kind === 'death' ? 'DEATH_DOCUMENT' : 'ORIGINAL_WILL',
  fileName: 'evidence.pdf', contentType: 'application/pdf', sizeBytes: bytes.length, sha256: digest, uploadedBy: caseId, uploadedAt: now });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const binary = (type = 'application/pdf', body = bytes) => new Response(body, { headers: { 'Content-Type': type, 'Content-Disposition': 'attachment; filename="evidence.pdf"' } });
const options = { accessToken: 'test-only-token', lang: 'en' };

test('PS-103 metadata list validates record/case/type and whitelists response fields', async () => {
  for (const kind of ['death', 'original-will']) {
    const result = await listLegalEvidence({ ...subject, kind }, { ...options, fetchFn: async (url, init) => {
      assert.ok(url.startsWith('/api/v1/legal-verifications/')); assert.ok(url.endsWith('/attachments'));
      assert.equal(init.method, 'GET'); assert.equal(init.headers.Authorization, 'Bearer test-only-token');
      assert.equal(init.headers['Accept-Language'], 'en');
      return json([{ ...meta(kind), url: 'https://untrusted.example/file', content: 'never copy' }]);
    } });
    assert.equal(result[0].fileName, 'evidence.pdf'); assert.equal(result[0].url, undefined); assert.equal(result[0].content, undefined);
  }
  for (const body of [{}, [meta(), meta()], [{ ...meta(), caseId: subjectId }], [{ ...meta(), subjectId: caseId }],
    [{ ...meta(), subjectType: 'OTHER' }], [{ ...meta(), contentType: 'text/html' }], [{ ...meta(), sha256: 'bad' }]]) {
    await assert.rejects(listLegalEvidence(subject, { ...options, fetchFn: async () => json(body) }), { code: 'INVALID_RESPONSE' });
  }
});

test('all three Legal content paths fetch authenticated binary, never evidenceReference or Staff/Owner endpoints', async () => {
  const cases = [
    [subject, `/death-documents/${subjectId}/attachments/${fileId}/content`],
    [{ ...subject, kind: 'original-will' }, `/verification-cases/${caseId}/original-will-intakes/${subjectId}/attachments/${fileId}/content`],
    [{ kind: 'basis', caseId, versionNo: 2 }, `/verification-cases/${caseId}/basis-dossier/versions/2/content`],
  ];
  for (const [target, suffix] of cases) {
    const controller = new AbortController();
    const result = await readLegalEvidence(target, meta(), { ...options, signal: controller.signal, fetchFn: async (url, init) => {
      assert.equal(url, '/api/v1/legal-verifications' + suffix); assert.equal(init.method, 'GET');
      assert.equal(init.cache, 'no-store'); assert.equal(init.credentials, 'omit'); assert.equal(init.signal, controller.signal);
      assert.equal(init.headers.Authorization, 'Bearer test-only-token'); assert.equal(init.headers['Accept-Language'], 'en');
      return binary();
    } });
    assert.equal(result.blob.size, bytes.length); assert.equal(result.contentType, 'application/pdf');
  }
});

test('unsafe MIME, empty/wrong-size bytes and checksum mismatch never become a preview', async () => {
  for (const [file, response] of [[meta(), binary('text/html')], [meta(), binary('image/svg+xml')], [meta(), binary('application/pdf', new Uint8Array())],
    [{ ...meta(), sizeBytes: 1 }, binary()], [{ ...meta(), sha256: '0'.repeat(64) }, binary()]]) {
    await assert.rejects(readLegalEvidence(subject, file, { ...options, fetchFn: async () => response }), { code: 'INVALID_RESPONSE' });
  }
  for (const type of ['image/jpeg', 'image/png']) {
    const result = await readLegalEvidence(subject, { ...meta(), contentType: type }, { ...options, fetchFn: async () => binary(type) });
    assert.equal(result.contentType, type);
  }
});

for (const status of [401, 403, 404, 500]) test(`HTTP ${status} preserves failure instead of decoding an error response as a file`, async () => {
  await assert.rejects(readLegalEvidence(subject, meta(), { ...options, fetchFn: async () => json({ code: 'FILE_ERROR' }, status) }), error => error.status === status && error.code === 'FILE_ERROR');
  await assert.rejects(listLegalEvidence(subject, { ...options, fetchFn: async () => json({ code: 'FILE_ERROR' }, status) }), error => error.status === status);
});

test('invalid identifiers/versions fail before network; late content after cancellation is discarded', async () => {
  for (const target of [{ ...subject, subjectId: 'https://evil.example' }, { kind: 'basis', caseId, versionNo: 0 }, { ...subject, kind: 'staff' }])
    await assert.rejects(readLegalEvidence(target, meta(), { ...options, fetchFn: () => assert.fail('Unexpected request') }), { code: 'VALIDATION_FAILED' });
  const controller = new AbortController();
  await assert.rejects(readLegalEvidence(subject, meta(), { ...options, signal: controller.signal, fetchFn: async () => { controller.abort(); return binary(); } }), { name: 'AbortError' });
});

const dom = new JSDOM('<body></body>', { url: 'http://localhost/legal/death-verification' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
async function component(entry) {
  const built = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry, formats: ['es'] },
    rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
  let code = (Array.isArray(built) ? built[0] : built).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
const Files = await component('src/pages/legal/LegalEvidenceFiles.jsx');
const originalFetch = globalThis.fetch, createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL;
let created, revoked;
test.beforeEach(() => { created = []; revoked = []; URL.createObjectURL = () => { const url = 'blob:test-' + created.length; created.push(url); return url; }; URL.revokeObjectURL = url => revoked.push(url); });
test.afterEach(() => { globalThis.fetch = originalFetch; URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl; });
const base = { ...subject, ...options, lang: 'en' };
async function mount(props = base, Component = Files) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const render = next => act(async () => root.render(React.createElement(Component, next)));
  await render(props);
  return { host, render, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
async function open(view, waitForContent = true) {
  const button = [...view.host.querySelectorAll('button')].find(item => item.textContent === 'Preview file');
  button.focus(); await act(async () => button.click());
  // WebCrypto digest finishes outside React's synchronous event queue.
  for (let i = 0; waitForContent && i < 100 && view.host.querySelector('[role=dialog] [role=status]'); i++)
    await act(async () => new Promise(resolve => setTimeout(resolve, 5)));
  return button;
}

test('preview uses a temporary Blob URL in a sandboxed dialog; Escape revokes it and restores focus', async () => {
  globalThis.fetch = async url => url.endsWith('/content') ? binary() : json([meta()]);
  const view = await mount();
  try {
    assert.equal(view.host.querySelector('a'), null);
    const trigger = await open(view); assert.equal(view.host.querySelector('iframe').src, 'blob:test-0');
    assert.equal(view.host.querySelector('iframe').getAttribute('sandbox'), '');
    assert.equal(view.host.querySelector('a[download]').getAttribute('href'), 'blob:test-0');
    await act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })));
    assert.deepEqual(revoked, ['blob:test-0']); assert.equal(view.host.querySelector('[role=dialog]'), null); assert.equal(document.activeElement, trigger);
  } finally { await view.close(); }
});

test('changing token or subject closes/revokes the old file and reloads metadata with current credentials', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push(init.headers.Authorization); return url.endsWith('/content') ? binary() : json([meta()]); };
  const view = await mount();
  try { await open(view); await view.render({ ...base, accessToken: 'next-token' });
    assert.deepEqual(revoked, ['blob:test-0']); assert.equal(view.host.querySelector('iframe'), null); assert.equal(calls.at(-1), 'Bearer next-token');
    await open(view); await view.render({ ...base, subjectId: fileId }); assert.ok(revoked.includes('blob:test-1')); assert.equal(view.host.querySelector('iframe'), null);
  } finally { await view.close(); }
});

test('closing a pending preview aborts it; a late response creates no Blob URL', async () => {
  let finish, signal;
  globalThis.fetch = async (url, init) => url.endsWith('/content') ? new Promise(resolve => { finish = resolve; signal = init.signal; }) : json([meta()]);
  const view = await mount();
  try { await open(view, false); await act(async () => view.host.querySelector('[aria-label=Close]').click()); assert.equal(signal.aborted, true);
    await act(async () => finish(binary())); assert.deepEqual(created, []); assert.equal(view.host.querySelector('[role=dialog]'), null);
  } finally { await view.close(); }
});

test('401/403 notify authorization handlers, 404 remains an error, and malformed metadata is not an empty success', async () => {
  for (const status of [401, 403, 404]) {
    const received = [];
    globalThis.fetch = async url => url.endsWith('/content') ? json({ code: 'DENIED' }, status) : json([meta()]);
    const view = await mount({ ...base, onUnauthorized: () => received.push(401), onDenied: () => received.push(403) });
    try { await open(view); assert.ok(view.host.querySelector('[role=alert]')); assert.deepEqual(created, []);
      assert.deepEqual(received, status === 404 ? [] : [status]);
    } finally { await view.close(); }
  }
  globalThis.fetch = async () => json({ unexpected: [] });
  const view = await mount();
  try { assert.ok(view.host.querySelector('[role=alert]')); assert.doesNotMatch(view.host.textContent, /No files are attached/); } finally { await view.close(); }
});

test('basis preview uses version content directly without a fabricated attachment listing endpoint', async () => {
  const calls = [];
  globalThis.fetch = async url => { calls.push(url); return binary(); };
  const view = await mount({ kind: 'basis', caseId, versionNo: 3, file: meta(), ...options, lang: 'en' });
  try { assert.deepEqual(calls, []); await open(view);
    assert.equal(calls.length, 1); assert.ok(calls[0].endsWith('/basis-dossier/versions/3/content'));
    assert.equal(view.host.querySelector('a[download]').getAttribute('download'), 'Basis version 3.pdf');
  } finally { await view.close(); }
  assert.deepEqual(revoked, ['blob:test-0']);
});

const Workflow = await component('src/pages/legal/LegalLiveWorkflow.jsx');
for (const [kind, step] of [['death', 'death-verification'], ['original-will', 'will-document-verification'], ['basis', 'dossier-review']]) {
  test(`real Legal ${step} reads its files from PS-103; evidenceReference remains plain text`, async () => {
    const reference = 'https://not-a-file.example/evidence-reference';
    const vaultStatus = kind === 'death' ? 'AWAITING_VERIFICATION' : 'LEGAL_BASIS_VERIFICATION';
    const basis = { id: caseId, caseId, route: 'COURT', status: 'LEGAL_BASIS_FORWARDED', disputeStatus: 'NONE', requiredVersion: 1,
      versions: [{ version: 1, sha256: digest, forwardStatus: 'FORWARDED', contentType: 'application/pdf', sizeBytes: bytes.length, evidenceReference: reference }] };
    const context = { caseId, caseNumber: 'CASE-TEST', vaultId: fileId, caseStatus: 'OPEN', vaultStatus, evaluatedAt: now,
      deathDocuments: [{ id: subjectId, documentType: 'DEATH_CERTIFICATE', receivedAt: now }],
      willComparison: { caseId, vaultStatus, approvalBlocked: true, originalWillIntakes: [{ id: subjectId, evidenceReference: reference }], wills: [], comparisons: [] },
      basisDossier: kind === 'basis' ? basis : null,
      snapshot: kind === 'basis' ? { dossierId: caseId, currentVersion: 1, requiredVersion: 1, sha256Hash: digest, allocationHash: digest,
        disputeStatus: 'NONE', reviewFresh: false, approvalCurrent: false, courtResult: null } : null,
      capabilities: { approval: { allowed: false, blockedReason: 'LEGAL_DECISION_STALE' }, unlock: { allowed: false, blockedReason: 'LEGAL_APPROVAL_REQUIRED' } } };
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push(url); assert.equal(init.method, 'GET'); assert.ok(url.startsWith('/api/v1/legal-verifications/'));
      if (url.endsWith('/content')) return binary();
      if (url.endsWith('/attachments')) return json([meta(kind)]);
      if (url.includes('verification-cases?')) return json({ content: [{ caseId, caseNumber: 'CASE-TEST', vaultId: fileId, caseStatus: 'OPEN', vaultStatus,
        route: 'COURT', openedAt: now }], page: 0, size: 20, totalElements: 1, totalPages: 1 });
      if (url.endsWith('/context')) return json(context);
      if (url.endsWith('will-comparisons')) return json(context.willComparison);
      if (url.endsWith('court-decisions')) return json([]);
      if (url.endsWith('/basis-dossier')) return json(basis);
      return json({ deathDocumentPublicId: subjectId, verificationCasePublicId: caseId, verificationCaseStatus: 'OPEN', vaultStatus,
        document: { issuingAuthority: 'Authority', documentNumber: 'REF', evidenceReference: reference }, decisions: [] });
    };
    const session = { accessToken: options.accessToken, expiresAt: Date.now() + 60000, user: { id: caseId, roles: ['LEGAL_VERIFIER'] } };
    const view = await mount({ session, step, caseId, lang: 'en' }, Workflow);
    try {
      if (kind !== 'basis') {
        const field = kind === 'death' ? view.host.querySelectorAll('select')[1] : view.host.querySelector('form select');
        const props = field[Object.keys(field).find(key => key.startsWith('__reactProps'))];
        await act(async () => props.onChange({ target: { value: subjectId } }));
      }
      assert.match(view.host.textContent, /https:\/\/not-a-file.example\/evidence-reference/);
      assert.equal(view.host.querySelector('a'), null);
      assert.equal(calls.some(url => url.endsWith('/content')), false, 'Reading metadata must not prefetch audited content');
      await open(view); assert.ok(view.host.querySelector('iframe'));
      assert.equal(calls.filter(url => url.endsWith('/content')).length, 1);
      assert.equal(calls.includes(reference), false);
    } finally { await view.close(); }
  });
}
