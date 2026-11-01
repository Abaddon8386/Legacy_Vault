import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readDms } from './dmsService.js';
import { isPersonalRecipient, readLinkRequest } from './caseLinkModel.js';
import { ApiError } from '../api/http.js';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/shared-with-me' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
async function component(entry) {
  const result = await build({ configFile: false, plugins: [react()], logLevel: 'silent', define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
    build: { write: false, minify: false, lib: { entry, formats: ['es'] }, rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] } } });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
const Shared = await component('src/pages/beneficiary/CaseLinkWorkspace.jsx');
const Counter = await component('src/pages/staff/StaffCaseLinkPanel.jsx');
const Grace = await component('src/components/dms/DmsGraceSettings.jsx');
const CancelAlert = await component('src/components/dms/OwnerLiveCancelAlert.jsx');
const DmsPage = await component('src/pages/dms/DMSOverviewPage.jsx');
async function mount(Component, props) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return { host, render: p => act(async () => root.render(React.createElement(Component, p))), close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const propsOf = element => element[Object.keys(element).find(key => key.startsWith('__reactProps$'))];
const change = (host, selector, value) => act(async () => propsOf(host.querySelector(selector)).onChange({ target: { value, checked: value } }));
const click = (host, text) => act(async () => { const b = [...host.querySelectorAll('button')].find(el => el.textContent.includes(text)); assert.ok(b, text); b.click(); });
const submit = host => act(async () => host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
const user = { id: 'owner-a', roles: ['VAULT_OWNER'] };
const base = { session: { user, accessToken: 'fixture' } };
const req = { id: 'r1', caseNumber: 'HS-2026-000001', status: 'PENDING', accountId: 'person-c', accountName: 'Người C', accountEmail: 'c@example.test' };
const recipient = { beneficiaryId: 'c', fullName: 'Người C', accountLinked: false, sourceLabel: 'Văn bản Tòa án', legalReference: 'VB-01' };
const caseItem = { status: 'OPEN', caseNumber: req.caseNumber };
const rawDms = { ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'MONITORING', checkIntervalMinutes: 65, checkIntervalDays: null, gracePeriodDays: 1, nextCheckAt: '2026-10-25T12:00:00Z' };

test('personal Owner can request; internal roles cannot; requester response strips private metadata', () => {
  assert.equal(isPersonalRecipient(['ROLE_VAULT_OWNER']), true);
  assert.equal(isPersonalRecipient(['BENEFICIARY', 'STAFF_EXECUTOR']), false);
  assert.deepEqual(readLinkRequest({ ...req, vaultName: 'private', secretContent: 'private' }), { id: req.id, caseNumber: req.caseNumber, status: req.status });
});
test('pending request does not grant asset reads, and double submit makes one request', async () => {
  let writes = 0, reads = 0, finish;
  const v = await mount(Shared, { ...base, receivedAssetActions: { list: async () => { reads++; } }, caseLinkActions: { listOwn: async () => [], submit: () => { writes++; return new Promise(resolve => { finish = resolve; }); } } });
  try {
    await change(v.host, '#case-link-number', req.caseNumber.toLowerCase());
    await act(async () => { v.host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); v.host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
    assert.equal(writes, 1);
    await act(async () => finish(req));
    assert.match(v.host.textContent, /Chờ Staff đối chiếu/); assert.equal(reads, 0);
    assert.doesNotMatch(v.host.textContent, /c@example.test/);
  } finally { await v.close(); }
});
test('uncertain mutation requires an explicit status reload before retry; draft survives', async () => {
  let writes = 0;
  const v = await mount(Shared, { ...base, caseLinkActions: { listOwn: async () => [], submit: async () => { writes++; throw new Error('network'); } } });
  try {
    await change(v.host, '#case-link-number', req.caseNumber); await submit(v.host); await submit(v.host);
    assert.equal(writes, 1); assert.equal(v.host.querySelector('input').value, req.caseNumber);
    await click(v.host, 'Tải lại trạng thái'); await submit(v.host); assert.equal(writes, 2);
  } finally { await v.close(); }
});
test('wrong case response cannot appear as a successful submitted request', async () => {
  const v = await mount(Shared, { ...base, caseLinkActions: { listOwn: async () => [], submit: async () => ({ ...req, caseNumber: 'OTHER' }) } });
  try { await change(v.host, 'input', req.caseNumber); await submit(v.host); assert.match(v.host.textContent, /Chưa xác minh được kết quả/); assert.doesNotMatch(v.host.textContent, /Đã gửi yêu cầu/); } finally { await v.close(); }
});
test('switch account aborts pending submit and late completion cannot leak into the new account', async () => {
  let finish, signal;
  const actions = { listOwn: async () => [], submit: (_data, opts) => { signal = opts.signal; return new Promise(resolve => { finish = resolve; }); } };
  const v = await mount(Shared, { ...base, caseLinkActions: actions });
  try {
    await change(v.host, 'input', req.caseNumber); await submit(v.host);
    await v.render({ session: { user: { id: 'other', roles: ['VAULT_OWNER'] }, accessToken: 'other-token' }, caseLinkActions: actions });
    assert.equal(signal.aborted, true); await act(async () => finish(req));
    assert.doesNotMatch(v.host.textContent, /HS-2026-000001/); assert.equal(v.host.querySelector('input').value, '');
  } finally { await v.close(); }
});
test('production preview flag never bypasses internal-role denial', async () => {
  let calls = 0;
  const v = await mount(Shared, { session: { user: { id: 'staff', roles: ['STAFF_EXECUTOR'] }, accessToken: 'staff' }, isDevPreview: true, caseLinkActions: { listOwn: async () => { calls++; return []; }, submit: async () => { calls++; } } });
  try { assert.equal(calls, 0); assert.equal(v.host.querySelector('input').disabled, true); } finally { await v.close(); }
});
test('Staff matches fixed account to court recipient and records evidence before approval', async () => {
  let sent;
  const actions = { listRecipients: async () => [recipient], listPending: async () => [req], approve: async data => { sent = data; return { ...req, status: 'APPROVED' }; } };
  const v = await mount(Counter, { caseId: 'case-a', caseItem, accessToken: 'staff', actions });
  try {
    const selects = () => [...v.host.querySelectorAll('select')];
    await act(async () => propsOf(selects()[0]).onChange({ target: { value: req.id } }));
    await act(async () => propsOf(selects()[1]).onChange({ target: { value: recipient.beneficiaryId } }));
    await click(v.host, 'Xác nhận liên kết'); assert.equal(sent, undefined);
    await change(v.host, 'input[maxlength="200"]', 'BB-01'); await change(v.host, 'input[type="checkbox"]', true);
    await click(v.host, 'Xác nhận liên kết');
    assert.deepEqual(sent, { caseId: 'case-a', requestId: req.id, recipientId: 'c', evidenceReference: 'BB-01' });
    assert.match(v.host.textContent, /chỉ xem được tài sản sau bàn giao/);
  } finally { await v.close(); }
});
test('Staff decline requires confirmation, can be cancelled, and resets when changing requests', async () => {
  let writes = 0, sent;
  const actions = { listRecipients: async () => [recipient], listPending: async () => [req], reject: async data => { writes++; sent = data; return { ...req, status: 'REJECTED' }; } };
  const v = await mount(Counter, { caseId: 'case-a', caseItem, accessToken: 'staff', actions });
  try {
    await click(v.host, 'Từ chối yêu cầu');
    assert.equal(v.host.querySelector('#counter-link-reject-confirmation'), null);
    await change(v.host, 'select', req.id);
    await click(v.host, 'Từ chối yêu cầu');
    assert.equal(writes, 0);
    assert.match(v.host.querySelector('#counter-link-reject-confirmation').textContent, /c@example.test/);
    await click(v.host, 'Giữ yêu cầu');
    assert.equal(writes, 0);
    assert.equal(v.host.querySelector('#counter-link-reject-confirmation'), null);
    await click(v.host, 'Từ chối yêu cầu');
    await change(v.host, 'select', '');
    assert.equal(v.host.querySelector('#counter-link-reject-confirmation'), null);
    await change(v.host, 'select', req.id);
    await click(v.host, 'Từ chối yêu cầu');
    await click(v.host, 'Xác nhận từ chối');
    assert.equal(writes, 1);
    assert.deepEqual(sent, { caseId: 'case-a', requestId: req.id });
    assert.match(v.host.textContent, /Đã từ chối yêu cầu/);
  } finally { await v.close(); }
});

test('Staff create-only clears password immediately and never calls approve', async () => {
  let finish, sent, approvals = 0;
  const actions = { listRecipients: async () => [recipient], listPending: async () => [], createAccount: data => { sent = data; return new Promise(resolve => { finish = resolve; }); }, approve: () => { approvals++; } };
  const v = await mount(Counter, { caseId: 'case-a', caseItem, accessToken: 'staff', actions });
  try {
    await change(v.host, 'form input:not([type])', 'Người C'); await change(v.host, 'input[type="email"]', 'c@example.test'); await change(v.host, 'input[type="password"]', 'fixture-only-password');
    await submit(v.host); assert.equal(v.host.querySelector('input[type="password"]').value, '');
    assert.equal(sent.fullName, 'Người C'); assert.equal(sent.caseId, 'case-a');
    await act(async () => finish({ accountId: 'person-c', linked: false }));
    assert.equal(approvals, 0); assert.match(v.host.textContent, /Đã tạo tài khoản/);
  } finally { await v.close(); }
});
test('closed case makes no recipient or pending-request calls', async () => {
  let reads = 0;
  const v = await mount(Counter, { caseId: 'closed', caseItem: { status: 'CLOSED' }, actions: { listRecipients: async () => { reads++; return []; }, listPending: async () => { reads++; return []; } } });
  try { assert.equal(reads, 0); assert.equal(v.host.querySelector('select'), null); } finally { await v.close(); }
});

test('replacement adapter can omit reference only with an explicit contract opt-in; identity check is still required',async()=>{
 let sent;const actions={counterEvidenceMode:'OPTIONAL',listRecipients:async()=>[recipient],listPending:async()=>[req],approve:async body=>{sent=body;return {...req,status:'APPROVED'};}};const v=await mount(Counter,{caseId:'case-a',caseItem,accessToken:'staff',actions});try{
 const selects=v.host.querySelectorAll('select');await act(async()=>propsOf(selects[0]).onChange({target:{value:req.id}}));await act(async()=>propsOf(selects[1]).onChange({target:{value:recipient.beneficiaryId}}));assert.equal(v.host.querySelector('input[maxlength="200"]'),null);await click(v.host,'Xác nhận liên kết');assert.equal(sent,undefined);await change(v.host,'input[type="checkbox"]',true);await click(v.host,'Xác nhận liên kết');assert.deepEqual(sent,{caseId:'case-a',requestId:req.id,recipientId:recipient.beneficiaryId});
 }finally{await v.close();}
});
test('Grace zero is valid data; UI respects supplied range and preserves minute precision', async () => {
  assert.equal(readDms({ ...rawDms, gracePeriodDays: 0 }).gracePeriodDays, 0);
  let sent, result;
  const v = await mount(Grace, { ownerId: rawDms.ownerId, accessToken: 'owner', data: readDms(rawDms), actions: { policy: { min: 0, max: 30 }, save: async data => { sent = data; return { ...rawDms, gracePeriodDays: data.gracePeriodDays }; } }, onSaved: data => { result = data; } });
  try {
    await change(v.host, 'input', '31'); await submit(v.host); assert.equal(sent, undefined);
    await change(v.host, 'input', '0'); await submit(v.host);
    assert.deepEqual(sent, { checkIntervalMinutes: 65, gracePeriodDays: 0 }); assert.equal(result.checkIntervalTotalMinutes, 65);
  } finally { await v.close(); }
});
for (const status of ['TRIGGERED', 'GRACE_PERIOD_EXCEEDED']) test(`Grace is read-only in ${status}`, async () => {
  let writes = 0;
  const v = await mount(Grace, { data: readDms({ ...rawDms, status }), actions: { policy: { min: 0, max: 30 }, save: async () => { writes++; } } });
  try { assert.equal(v.host.querySelector('input').disabled, true); await submit(v.host); assert.equal(writes, 0); } finally { await v.close(); }
});
test('Grace network error preserves draft and prevents another mutation until reload', async () => {
  let writes = 0;
  const v = await mount(Grace, { data: readDms(rawDms), actions: { policy: { min: 0, max: 30 }, save: async () => { writes++; throw new Error('network'); } } });
  try { await change(v.host, 'input', '7'); await submit(v.host); await submit(v.host); assert.equal(writes, 1); assert.equal(v.host.querySelector('input').value, '7'); } finally { await v.close(); }
});
test('live cancel checks vault, asks confirmation, posts exact vault and refreshes only after success', async () => {
  const original = globalThis.fetch;
  const vault = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Kho A', status: 'AWAITING_VERIFICATION', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-25T00:00:00Z' };
  const calls = []; let refreshed = 0;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method });
    const value = options.method === 'POST' ? { ...vault, status: 'ACTIVE' } : { content: [vault], page: 0, size: 20, totalElements: 1, totalPages: 1 };
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => value };
  };
  const v = await mount(CancelAlert, { accessToken: 'owner', ownerId: rawDms.ownerId, dmsStatus: 'GRACE_PERIOD_EXCEEDED', isOwner: true, onRefreshRequired: () => { refreshed++; } });
  try {
    await click(v.host, 'Hủy cảnh báo'); assert.equal(calls.length, 1);
    await click(document.body, 'Xác nhận hủy cảnh báo');
    assert.equal(calls[1].url, `/api/v1/vaults/${vault.id}/cancel-alert`); assert.equal(calls[1].method, 'POST'); assert.equal(refreshed, 1);
  } finally { await v.close(); globalThis.fetch = original; }
});
test('live cancel does not expose cancellation during grace or for a non-owner', async () => {
  const original = globalThis.fetch; let reads = 0;
  globalThis.fetch = async () => { reads++; throw new Error('must not read'); };
  const v = await mount(CancelAlert, { accessToken: 'owner', isOwner: true, dmsStatus: 'TRIGGERED' });
  try { assert.equal(v.host.textContent, ''); await v.render({ accessToken: 'staff', isOwner: false, dmsStatus: 'GRACE_PERIOD_EXCEEDED' }); assert.equal(reads, 0); } finally { await v.close(); globalThis.fetch = original; }
});
test('actual DMS page coordinates Grace, interval and check-in writes', async () => {
  const original = globalThis.fetch; let writes = 0, finish;
  globalThis.fetch = async (_url, options) => { if (options.method !== 'GET') writes++; return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => rawDms }; };
  const v = await mount(DmsPage, { ownerId: rawDms.ownerId, accessToken: 'owner', graceActions: { policy: { min: 0, max: 30 }, save: () => new Promise(resolve => { finish = resolve; }) } });
  try {
    await change(v.host, '#grace-days', '7');
    await act(async () => v.host.querySelector('.lv-grace-settings form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(v.host.querySelector('.lv-dms-checkin-btn').disabled, true);
    await submit(v.host); assert.equal(writes, 0);
    await act(async () => finish({ ...rawDms, gracePeriodDays: 7 }));
    assert.equal(v.host.querySelector('#grace-days').value, '7'); assert.equal(v.host.querySelector('.lv-dms-checkin-btn').disabled, false);
  } finally { await v.close(); globalThis.fetch = original; }
});


test('Grace days, hours and minutes preserve total minutes through the adapter', async () => {
  let sent, saved;
  const v = await mount(Grace, { ownerId: rawDms.ownerId, data: readDms(rawDms), actions: { durationUnit: 'minutes', policy: { minMinutes: 0, maxMinutes: 43200 }, save: async payload => { sent = payload; return { ...rawDms, gracePeriodDays: 0, gracePeriodMinutes: payload.gracePeriodMinutes }; } }, onSaved: value => { saved = value; } });
  try {
    await change(v.host, '#grace-days', '0'); await change(v.host, '#grace-hours', '1'); await change(v.host, '#grace-minutes', '5'); await submit(v.host);
    assert.deepEqual(sent, { checkIntervalMinutes: 65, gracePeriodMinutes: 65 });
    assert.equal(saved.gracePeriodMinutes, 65);
    assert.equal(v.host.querySelector('#grace-hours').value, '1');
    assert.equal(v.host.querySelector('#grace-minutes').value, '5');
  } finally { await v.close(); }
});

test('Grace never silently rounds hours to a legacy whole-day save', async () => {
  let writes = 0;
  const v = await mount(Grace, { data: readDms(rawDms), actions: { policy: { min: 0, max: 30 }, save: async () => { writes++; } } });
  try {
    await change(v.host, '#grace-hours', '1'); await submit(v.host);
    assert.equal(writes, 0); assert.match(v.host.textContent, /chưa hỗ trợ lưu theo giờ, phút/i);
  } finally { await v.close(); }
});

test('Grace rejects invalid minute fields and mismatching saved precision', async () => {
  let writes = 0, saved = 0;
  const v = await mount(Grace, { data: readDms(rawDms), actions: { durationUnit: 'minutes', policy: { minMinutes: 0, maxMinutes: 43200 }, save: async () => { writes++; return rawDms; } }, onSaved: () => { saved++; } });
  try {
    await change(v.host, '#grace-minutes', '60'); await submit(v.host); assert.equal(writes, 0);
    await change(v.host, '#grace-minutes', '5'); await submit(v.host); assert.equal(writes, 1); assert.equal(saved, 0);
    assert.equal(v.host.querySelector('#grace-minutes').value, '5'); await submit(v.host); assert.equal(writes, 1);
  } finally { await v.close(); }
});

test('Task 4: REJECTED request with explicit reason preserves field from response -> adapter -> UI', async () => {
  const rejectedWithReason = {
    id: 'req-rej-01',
    caseNumber: 'HS-2026-000099',
    status: 'REJECTED',
    reason: 'Hồ sơ thiếu chứng minh nhân dân của người nhận',
  };
  // 1. Adapter preserves reason
  const adapted = readLinkRequest(rejectedWithReason);
  assert.equal(adapted.reason, 'Hồ sơ thiếu chứng minh nhân dân của người nhận');

  // 2. Component renders the explicit reason
  const v = await mount(Shared, {
    ...base,
    caseLinkActions: {
      listOwn: async () => [rejectedWithReason],
      submit: async () => {},
    },
    lang: 'vi',
  });
  try {
    assert.match(v.host.textContent, /Lý do từ chối:/);
    assert.match(v.host.textContent, /Hồ sơ thiếu chứng minh nhân dân của người nhận/);
  } finally {
    await v.close();
  }
});

test('Task 4: REJECTED request without reason (real BE contract) renders neutral guidance', async () => {
  const rejectedWithoutReason = {
    id: 'req-rej-02',
    caseNumber: 'HS-2026-000100',
    status: 'REJECTED',
  };
  // 1. Adapter succeeds without error
  const adapted = readLinkRequest(rejectedWithoutReason);
  assert.equal(adapted.status, 'REJECTED');
  assert.equal(adapted.reason, undefined);

  // 2. Component renders neutral guidance (VI)
  const vVi = await mount(Shared, {
    ...base,
    caseLinkActions: {
      listOwn: async () => [rejectedWithoutReason],
      submit: async () => {},
    },
    lang: 'vi',
  });
  try {
    assert.match(vVi.host.textContent, /Yêu cầu liên kết đã bị từ chối/);
    assert.match(vVi.host.textContent, /liên hệ nhân viên tại quầy/);
  } finally {
    await vVi.close();
  }

  // 3. Component renders neutral guidance (EN)
  const vEn = await mount(Shared, {
    ...base,
    caseLinkActions: {
      listOwn: async () => [rejectedWithoutReason],
      submit: async () => {},
    },
    lang: 'en',
  });
  try {
    assert.match(vEn.host.textContent, /Your request was declined/);
    assert.match(vEn.host.textContent, /contact Staff at the counter/);
  } finally {
    await vEn.close();
  }
});


test('Task 2: REJECTED request with null, empty, or whitespace reason normalizes to neutral guidance', async () => {
  for (const emptyVal of [null, '', '   ', '\t\n']) {
    const raw = {
      id: 'req-empty-01',
      caseNumber: 'HS-2026-000101',
      status: 'REJECTED',
      reason: emptyVal,
    };
    const adapted = readLinkRequest(raw);
    assert.equal(adapted.reason, undefined, `Expected reason for ${JSON.stringify(emptyVal)} to be undefined`);
  }

  const v = await mount(Shared, {
    ...base,
    caseLinkActions: {
      listOwn: async () => [{
        id: 'req-empty-02',
        caseNumber: 'HS-2026-000102',
        status: 'REJECTED',
        reason: '   ',
      }],
      submit: async () => {},
    },
    lang: 'vi',
  });
  try {
    assert.match(v.host.textContent, /Yêu cầu liên kết đã bị từ chối/);
    assert.match(v.host.textContent, /liên hệ nhân viên tại quầy/);
  } finally {
    await v.close();
  }
});

test('Task 2: REJECTED request with invalid type (object, array, number, boolean) throws INVALID_RESPONSE', () => {
  const invalidTypes = [
    { text: 'Object error' },
    ['Array', 'error'],
    12345,
    true,
    false,
  ];

  for (const badReason of invalidTypes) {
    assert.throws(
      () => readLinkRequest({ id: 'req-bad-01', caseNumber: 'HS-2026-000103', status: 'REJECTED', reason: badReason }),
      (err) => err?.code === 'INVALID_RESPONSE',
      `Expected INVALID_RESPONSE for reason type ${typeof badReason}`
    );
    assert.throws(
      () => readLinkRequest({ id: 'req-bad-02', caseNumber: 'HS-2026-000104', status: 'REJECTED', rejectionReason: badReason }),
      (err) => err?.code === 'INVALID_RESPONSE',
      `Expected INVALID_RESPONSE for rejectionReason type ${typeof badReason}`
    );
  }
});

test('Task 2: REJECTED request with both reason and rejectionReason prioritizes reason', () => {
  const bothProvided = {
    id: 'req-both-01',
    caseNumber: 'HS-2026-000105',
    status: 'REJECTED',
    reason: 'Lý do ưu tiên chính',
    rejectionReason: 'Lý do thứ hai',
  };
  const adapted = readLinkRequest(bothProvided);
  assert.equal(adapted.reason, 'Lý do ưu tiên chính');

  const fallbackToSecond = {
    id: 'req-both-02',
    caseNumber: 'HS-2026-000106',
    status: 'REJECTED',
    reason: '   ',
    rejectionReason: 'Lý do thay thế',
  };
  const adaptedFallback = readLinkRequest(fallbackToSecond);
  assert.equal(adaptedFallback.reason, 'Lý do thay thế');
});

test('Task 2: Adapter error on malformed response does NOT crash page; displays error banner', async () => {
  const v = await mount(Shared, {
    ...base,
    caseLinkActions: {
      listOwn: async () => {
        // Simulates adapter throwing INVALID_RESPONSE due to malformed backend payload
        throw new ApiError('INVALID_RESPONSE');
      },
      submit: async () => {},
    },
    lang: 'vi',
  });
  try {
    assert.match(v.host.textContent, /Chưa xác minh được kết quả/);
  } finally {
    await v.close();
  }
});

test('CaseLinkWorkspace polling: slow response (> 4s) is not aborted by poll timer or focus/visibility, stops when no longer PENDING, and aborts on account/token switch', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let calls = 0;
  const signals = [];
  const resolvers = [];

  const pendingItem = { id: 'req-slow-01', caseNumber: 'HS-2026-000777', status: 'PENDING' };
  const approvedItem = { id: 'req-slow-01', caseNumber: 'HS-2026-000777', status: 'APPROVED' };

  const actions = {
    listOwn: ({ signal }) => {
      calls++;
      signals.push(signal);
      return new Promise((resolve) => {
        resolvers.push(resolve);
      });
    },
    submit: async () => {},
  };

  const v = await mount(Shared, {
    ...base,
    caseLinkActions: actions,
    lang: 'vi',
  });

  try {
    // Initial read #1 is in-flight
    assert.equal(calls, 1, 'Initial listOwn call should be started');
    assert.equal(signals[0].aborted, false);

    // Simulate slow initial read taking 6 seconds (> 4s poll delay) + focus/visibility events while in-flight
    await act(async () => {
      t.mock.timers.tick(6000);
      window.dispatchEvent(new window.Event('focus'));
      document.dispatchEvent(new window.Event('visibilitychange'));
    });
    assert.equal(calls, 1, 'No concurrent poll must start while initial read is in-flight');
    assert.equal(signals[0].aborted, false, 'Slow initial read (> 4s) must NOT be aborted');

    // Resolve initial read #1 with PENDING status -> schedules poll #2 in 4000ms
    await act(async () => {
      resolvers[0]([pendingItem]);
    });
    assert.match(v.host.textContent, /Chờ Staff đối chiếu/);
    assert.equal(calls, 1, 'Poll #2 waits for 4000ms timeout after read #1 settles');

    // Advance 4000ms -> poll #2 starts
    await act(async () => {
      t.mock.timers.tick(4000);
    });
    assert.equal(calls, 2, 'Poll #2 starts 4000ms after read #1 completed');
    assert.equal(signals[1].aborted, false);

    // Now simulate poll #2 taking 9 seconds (> 2x 4000ms) and window focus firing mid-flight
    await act(async () => {
      t.mock.timers.tick(4500);
      window.dispatchEvent(new window.Event('focus'));
      document.dispatchEvent(new window.Event('visibilitychange'));
      t.mock.timers.tick(4500);
    });
    assert.equal(calls, 2, 'No overlapping poll #3 while slow poll #2 (9s) is still in-flight');
    assert.equal(signals[1].aborted, false, 'Slow poll #2 (> 4s) must NOT be aborted by timer or focus');

    // Resolve slow poll #2 with APPROVED status -> no more PENDING requests, polling must stop!
    await act(async () => {
      resolvers[1]([approvedItem]);
    });
    assert.match(v.host.textContent, /Đã liên kết/);

    // Advance another 12000ms and fire focus -> no more polls because status is APPROVED
    await act(async () => {
      t.mock.timers.tick(12000);
      window.dispatchEvent(new window.Event('focus'));
    });
    assert.equal(calls, 2, 'Polling must stop once no request is PENDING');

    // Now test account/token change while a poll is in-flight:
    // First manual reload returns PENDING again
    await click(v.host, 'Tải lại trạng thái');
    assert.equal(calls, 3);
    await act(async () => {
      resolvers[2]([pendingItem]);
    });
    // Trigger poll #4 via 4000ms timer
    await act(async () => {
      t.mock.timers.tick(4000);
    });
    assert.equal(calls, 4, 'Poll #4 is now in-flight for first account');
    assert.equal(signals[3].aborted, false);

    // Switch session token/account while poll #4 is in-flight
    await v.render({
      session: { user: { id: 'owner-b', roles: ['VAULT_OWNER'] }, accessToken: 'token-b' },
      caseLinkActions: actions,
      lang: 'vi',
    });
    assert.equal(signals[3].aborted, true, 'Switching account/token must abort in-flight poll of previous account');
  } finally {
    await v.close();
    t.mock.timers.reset();
  }
});

test('CaseLinkWorkspace polling: 2 PENDING requests -> cancel one -> polling continues -> remaining request transitions to APPROVED/REJECTED -> UI updates and polling stops', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let listCalls = 0;
  let cancelCalls = 0;
  const resolvers = [];

  const reqA = { id: 'req-multi-a', caseNumber: 'HS-2026-000201', status: 'PENDING' };
  const reqB = { id: 'req-multi-b', caseNumber: 'HS-2026-000202', status: 'PENDING' };
  const reqACancelled = { id: 'req-multi-a', caseNumber: 'HS-2026-000201', status: 'CANCELLED' };
  const reqBRejected = {
    id: 'req-multi-b',
    caseNumber: 'HS-2026-000202',
    status: 'REJECTED',
    reason: 'Chưa khớp giấy tờ tùy thân tại quầy',
  };

  const actions = {
    listOwn: () => {
      listCalls++;
      return new Promise((resolve) => {
        resolvers.push(resolve);
      });
    },
    submit: async ({ caseNumber }) => ({
      id: 'req-multi-c',
      caseNumber,
      status: 'PENDING',
    }),
    cancel: async ({ requestId }) => {
      cancelCalls++;
      assert.equal(requestId, reqA.id);
      return reqACancelled;
    },
  };

  const v = await mount(Shared, {
    ...base,
    caseLinkActions: actions,
    lang: 'vi',
  });

  try {
    // 1. Initial load returns 2 PENDING requests (reqA and reqB)
    assert.equal(listCalls, 1, 'Initial listOwn #1 called');
    await act(async () => {
      resolvers[0]([reqA, reqB]);
    });
    assert.match(v.host.textContent, /HS-2026-000201/);
    assert.match(v.host.textContent, /HS-2026-000202/);

    // 2. Cancel the first PENDING request (reqA) while poll timer is waiting
    const cancelBtns = [...v.host.querySelectorAll('button')].filter((el) =>
      el.textContent.includes('Hủy yêu cầu')
    );
    assert.equal(cancelBtns.length, 2, 'Both PENDING requests should have Cancel buttons');
    await act(async () => {
      cancelBtns[0].click();
    });
    assert.equal(cancelCalls, 1, 'Cancel mutation executed for reqA');
    assert.match(v.host.textContent, /Đã hủy yêu cầu/);

    // Only reqB remains PENDING; advance 4000ms -> polling MUST continue and fire listOwn #2!
    await act(async () => {
      t.mock.timers.tick(4000);
    });
    assert.equal(
      listCalls,
      2,
      'Polling must continue after cancelling 1 of 2 PENDING requests because reqB is still PENDING'
    );

    // 3. Resolve poll #2: reqB transitions to REJECTED (so 0 PENDING requests remain)
    await act(async () => {
      resolvers[1]([reqACancelled, reqBRejected]);
    });
    assert.match(v.host.textContent, /Chưa khớp giấy tờ tùy thân tại quầy/);

    // 4. Advance another 12000ms and fire focus -> polling must stay stopped because no PENDING remains
    await act(async () => {
      t.mock.timers.tick(12000);
      window.dispatchEvent(new window.Event('focus'));
    });
    assert.equal(listCalls, 2, 'Polling must stop once the remaining request transitions out of PENDING');

    // 5. Submit 2 new PENDING requests -> cancel one -> remaining transitions to APPROVED -> polling stops;
    //    also verify failed mutation sets uncertain and pauses background polling until explicit reload
    let failCancel = false;
    const reqC = { id: 'req-multi-c', caseNumber: 'HS-2026-000203', status: 'PENDING' };
    const reqD = { id: 'req-multi-d', caseNumber: 'HS-2026-000204', status: 'PENDING' };
    const reqCCancelled = { id: 'req-multi-c', caseNumber: 'HS-2026-000203', status: 'CANCELLED' };
    const reqDApproved = { id: 'req-multi-d', caseNumber: 'HS-2026-000204', status: 'APPROVED' };

    actions.cancel = async ({ requestId }) => {
      cancelCalls++;
      if (failCancel) throw new Error('network');
      assert.equal(requestId, reqC.id);
      return reqCCancelled;
    };

    await click(v.host, 'Tải lại trạng thái');
    assert.equal(listCalls, 3);
    await act(async () => {
      resolvers[2]([reqC, reqD]);
    });

    // First, simulate failed cancel mutation -> uncertain = true -> background polling must NOT overwrite uncertain state
    failCancel = true;
    const cancelBtns2 = [...v.host.querySelectorAll('button')].filter((el) =>
      el.textContent.includes('Hủy yêu cầu')
    );
    await act(async () => {
      cancelBtns2[0].click();
    });
    await act(async () => {
      t.mock.timers.tick(8000);
      window.dispatchEvent(new window.Event('focus'));
    });
    assert.equal(listCalls, 3, 'Background polling must pause while mutation outcome is uncertain');
    const cancelBtnsWhileUncertain = [...v.host.querySelectorAll('button')].filter((el) =>
      el.textContent.includes('Hủy yêu cầu')
    );
    assert.equal(cancelBtnsWhileUncertain[0].disabled, true, 'Cancel button remains disabled while uncertain until explicit reload');

    // Explicit status reload clears uncertain -> cancel reqC succeeds -> polling continues -> reqD becomes APPROVED -> polling stops
    failCancel = false;
    await click(v.host, 'Tải lại trạng thái');
    assert.equal(listCalls, 4);
    await act(async () => {
      resolvers[3]([reqC, reqD]);
    });

    const cancelBtnsAfterReload = [...v.host.querySelectorAll('button')].filter((el) =>
      el.textContent.includes('Hủy yêu cầu')
    );
    await act(async () => {
      cancelBtnsAfterReload[0].click();
    });
    await act(async () => {
      t.mock.timers.tick(4000);
    });
    assert.equal(listCalls, 5, 'Polling continues after cancelling reqC while reqD is still PENDING');

    await act(async () => {
      resolvers[4]([reqCCancelled, reqDApproved]);
    });
    assert.match(v.host.textContent, /Đã liên kết/);

    await act(async () => {
      t.mock.timers.tick(12000);
    });
    assert.equal(listCalls, 5, 'Polling stops once reqD transitions to APPROVED');
  } finally {
    await v.close();
    t.mock.timers.reset();
  }
});
