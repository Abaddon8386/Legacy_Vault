import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { liveCounterLinkActions } from './caseLinkService.js';
import { recordCounterAttestation } from '../pages/staff/liveHandoverService.js';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/staff/counter-link' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function component(entry) {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
  }
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}

const StaffCaseLinkPanel = await component('src/pages/staff/StaffCaseLinkPanel.jsx');

const caseId = '11111111-1111-4111-8111-111111111111';
const recipientId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const accountId = '44444444-4444-4444-8444-444444444444';
const staffId = '55555555-5555-4555-8555-555555555555';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mount(Component, props) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return {
    host,
    render: p => act(async () => root.render(React.createElement(Component, p))),
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

const propsOf = el => el[Object.keys(el).find(k => k.startsWith('__reactProps$'))];
const change = (host, selector, value) => act(async () => propsOf(host.querySelector(selector)).onChange({ target: { value, checked: value } }));
const click = (host, text) => act(async () => {
  const b = [...host.querySelectorAll('button')].find(el => el.textContent.includes(text));
  assert.ok(b, text);
  b.click();
});

test('PS-140: recordCounterAttestation accepts empty, absent, whitespace, or null evidenceReference', async () => {
  const capturedCalls = [];
  const fakeFetch = async (url, init) => {
    capturedCalls.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined });
    return jsonResponse({
      id: '99999999-9999-4999-8999-999999999999',
      caseId,
      beneficiaryId: recipientId,
      staffId,
      verifiedAt: '2026-11-01T12:00:00Z',
    }, 201);
  };

  const options = { accessToken: 'valid-token', fetchFn: fakeFetch };

  // 1. Empty payload
  await recordCounterAttestation(caseId, recipientId, {}, options);
  assert.deepEqual(capturedCalls[0].body, {});
  assert.equal(capturedCalls[0].url.includes('/identity-attestations'), true);

  // 2. evidenceReference: ''
  await recordCounterAttestation(caseId, recipientId, { evidenceReference: '' }, options);
  assert.deepEqual(capturedCalls[1].body, {});

  // 3. evidenceReference: '   '
  await recordCounterAttestation(caseId, recipientId, { evidenceReference: '   ' }, options);
  assert.deepEqual(capturedCalls[2].body, {});

  // 4. evidenceReference: null
  await recordCounterAttestation(caseId, recipientId, { evidenceReference: null }, options);
  assert.deepEqual(capturedCalls[3].body, {});

  // 5. Valid evidenceReference
  await recordCounterAttestation(caseId, recipientId, { evidenceReference: '  HS-REF-99  ' }, options);
  assert.deepEqual(capturedCalls[4].body, { evidenceReference: 'HS-REF-99' });

  // 6. With confirmedEmail
  await recordCounterAttestation(caseId, recipientId, { confirmedEmail: 'user@example.com' }, options);
  assert.deepEqual(capturedCalls[5].body, { confirmedEmail: 'user@example.com' });

  // 7. Validation: invalid caseId or recipientId must throw VALIDATION_FAILED 400
  await assert.rejects(
    recordCounterAttestation('not-a-uuid', recipientId, {}, options),
    e => e.status === 400 && e.code === 'VALIDATION_FAILED'
  );
  await assert.rejects(
    recordCounterAttestation(caseId, 'not-a-uuid', {}, options),
    e => e.status === 400 && e.code === 'VALIDATION_FAILED'
  );

  // 8. Validation: evidenceReference > 200 chars must throw VALIDATION_FAILED 400
  await assert.rejects(
    recordCounterAttestation(caseId, recipientId, { evidenceReference: 'x'.repeat(201) }, options),
    e => e.status === 400 && e.code === 'VALIDATION_FAILED'
  );
});

test('PS-140: liveCounterLinkActions.approve records attestation before approval and supports optional reference', async () => {
  assert.equal(liveCounterLinkActions.counterEvidenceMode, 'OPTIONAL');

  const capturedCalls = [];
  const fakeFetch = async (url, init) => {
    capturedCalls.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined });
    if (url.includes('/identity-attestations')) {
      return jsonResponse({ id: 'attestation-1', caseId, beneficiaryId: recipientId }, 201);
    }
    if (url.includes('/approve')) {
      return jsonResponse({ requestId, status: 'APPROVED', beneficiaryId: recipientId, accountId }, 200);
    }
    return jsonResponse({}, 404);
  };

  const options = { accessToken: 'token-staff', fetchFn: fakeFetch };

  // Call approve without evidenceReference
  const resultNoRef = await liveCounterLinkActions.approve(
    { caseId, requestId, recipientId },
    options
  );

  assert.equal(resultNoRef.status, 'APPROVED');
  assert.equal(resultNoRef.accountId, accountId);
  assert.equal(capturedCalls.length, 2);
  // Verify order: attestation MUST be called first
  assert.equal(capturedCalls[0].url.includes('/identity-attestations'), true);
  assert.deepEqual(capturedCalls[0].body, {});
  // Then approve is called with beneficiaryId
  assert.equal(capturedCalls[1].url.includes(`/link-requests/${requestId}/approve`), true);
  assert.deepEqual(capturedCalls[1].body, { beneficiaryId: recipientId });

  // Call approve with evidenceReference
  capturedCalls.length = 0;
  const resultWithRef = await liveCounterLinkActions.approve(
    { caseId, requestId, recipientId, evidenceReference: '  COUNTER-DOC-88  ' },
    options
  );
  assert.equal(resultWithRef.status, 'APPROVED');
  assert.equal(capturedCalls[0].url.includes('/identity-attestations'), true);
  assert.deepEqual(capturedCalls[0].body, { evidenceReference: 'COUNTER-DOC-88' });
  assert.equal(capturedCalls[1].url.includes('/approve'), true);

  // If attestation fails (e.g. 403), approve must NEVER be called
  capturedCalls.length = 0;
  const failingFetch = async (url) => {
    capturedCalls.push({ url });
    if (url.includes('/identity-attestations')) {
      return jsonResponse({ code: 'ACCESS_DENIED' }, 403);
    }
    return jsonResponse({}, 200);
  };
  await assert.rejects(
    liveCounterLinkActions.approve({ caseId, requestId, recipientId }, { accessToken: 't', fetchFn: failingFetch }),
    e => e.status === 403
  );
  assert.equal(capturedCalls.length, 1);
  assert.equal(capturedCalls[0].url.includes('/identity-attestations'), true);
});

test('PS-140: StaffCaseLinkPanel renders reference-free layout and verifies account link without manual code', async () => {
  const recipient = {
    beneficiaryId: recipientId,
    fullName: 'Nguyen Van Beneficiary',
    accountLinked: false,
    sourceLabel: 'Court Partition',
  };
  const requestItem = {
    id: requestId,
    caseNumber: 'HS-2026-000123',
    status: 'PENDING',
    accountId,
    accountName: 'Nguyen Van Beneficiary',
    accountEmail: 'beneficiary@example.com',
  };

  let approvedPayload = null;
  const actions = {
    counterEvidenceMode: 'OPTIONAL',
    listRecipients: async () => [recipient],
    listPending: async () => [requestItem],
    approve: async (payload) => {
      approvedPayload = payload;
      return { id: requestId, caseNumber: 'HS-2026-TEST', status: 'APPROVED', accountId };
    },
  };

  const v = await mount(StaffCaseLinkPanel, {
    caseId,
    caseItem: { caseId, caseNumber: 'HS-2026-000123', status: 'OPEN' },
    accessToken: 'staff-token',
    lang: 'vi',
    actions,
  });

  try {
    // 1. Verify layout has 'is-reference-free' and NO input for reference
    const columns = v.host.querySelector('.lv-counter-link__columns');
    assert.equal(columns?.classList.contains('is-reference-free'), true);
    assert.equal(v.host.querySelector('input[maxlength="200"]'), null);

    // 2. Select request and recipient
    const selects = v.host.querySelectorAll('select');
    assert.equal(selects.length, 2);

    await act(async () => {
      propsOf(selects[0]).onChange({ target: { value: requestId } });
    });
    await act(async () => {
      propsOf(selects[1]).onChange({ target: { value: recipientId } });
    });

    // Button should be disabled until checkbox is checked
    const approveBtn = [...v.host.querySelectorAll('button')].find(b => b.textContent.includes('Xác nhận liên kết'));
    assert.equal(approveBtn?.disabled, true);

    // Check verification checkbox
    await change(v.host, 'input[type="checkbox"]', true);

    // Button should now be enabled without entering any reference!
    assert.equal(approveBtn?.disabled, false);

    // Click confirm link
    await click(v.host, 'Xác nhận liên kết');

    // Verify approve was called without evidenceReference property
    assert.deepEqual(approvedPayload, {
      caseId,
      requestId,
      recipientId,
    });
  } finally {
    await v.close();
  }
});

test('PS-140: StaffCaseLinkPanel preserves input requirement when adapter specifies REQUIRED', async () => {
  const recipient = {
    beneficiaryId: recipientId,
    fullName: 'Nguyen Van Beneficiary',
    accountLinked: false,
    sourceLabel: 'Court Partition',
  };
  const requestItem = {
    id: requestId,
    caseNumber: 'HS-2026-000123',
    status: 'PENDING',
    accountId,
    accountName: 'Nguyen Van Beneficiary',
    accountEmail: 'beneficiary@example.com',
  };

  let approvedPayload = null;
  const actions = {
    counterEvidenceMode: 'REQUIRED',
    listRecipients: async () => [recipient],
    listPending: async () => [requestItem],
    approve: async (payload) => {
      approvedPayload = payload;
      return { id: requestId, caseNumber: 'HS-2026-000123', status: 'APPROVED', accountId };
    },
  };

  const v = await mount(StaffCaseLinkPanel, {
    caseId,
    caseItem: { caseId, caseNumber: 'HS-2026-000123', status: 'OPEN' },
    accessToken: 'staff-token',
    lang: 'vi',
    actions,
  });

  try {
    const columns = v.host.querySelector('.lv-counter-link__columns');
    assert.equal(columns?.classList.contains('is-reference-free'), false);
    const input = v.host.querySelector('input[maxlength="200"]');
    assert.notEqual(input, null);

    const selects = v.host.querySelectorAll('select');
    await act(async () => {
      propsOf(selects[0]).onChange({ target: { value: requestId } });
    });
    await act(async () => {
      propsOf(selects[1]).onChange({ target: { value: recipientId } });
    });

    await change(v.host, 'input[type="checkbox"]', true);

    const approveBtn = [...v.host.querySelectorAll('button')].find(b => b.textContent.includes('Xác nhận liên kết'));
    // In REQUIRED mode, disabled because reference is empty
    assert.equal(approveBtn?.disabled, true);

    // Enter reference
    await change(v.host, 'input[maxlength="200"]', 'BB-REQUIRED-001');
    assert.equal(approveBtn?.disabled, false);

    await click(v.host, 'Xác nhận liên kết');
    assert.deepEqual(approvedPayload, {
      caseId,
      requestId,
      recipientId,
      evidenceReference: 'BB-REQUIRED-001',
    });
  } finally {
    await v.close();
  }
});

test('PS-140: switching case aborts in-flight request and prevents state leakage', async () => {
  let abortSignalReceived = false;
  const actions = {
    counterEvidenceMode: 'OPTIONAL',
    listRecipients: async (_params, options) => {
      options.signal?.addEventListener('abort', () => {
        abortSignalReceived = true;
      });
      await new Promise(r => setTimeout(r, 100));
      return [];
    },
    listPending: async () => [],
  };

  const v = await mount(StaffCaseLinkPanel, {
    caseId,
    caseItem: { caseId, caseNumber: 'HS-2026-000123', status: 'OPEN' },
    accessToken: 'staff-token',
    lang: 'vi',
    actions,
  });

  try {
    // Switch case immediately
    await v.render({
      caseId: '99999999-9999-4999-8999-999999999999',
      caseItem: { caseId: '99999999-9999-4999-8999-999999999999', caseNumber: 'HS-2026-000999', status: 'OPEN' },
      accessToken: 'staff-token',
      lang: 'vi',
      actions,
    });
    assert.equal(abortSignalReceived, true);
  } finally {
    await v.close();
  }
});
