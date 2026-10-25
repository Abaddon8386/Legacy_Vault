import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readDms } from './dmsService.js';
import { isPersonalRecipient, readLinkRequest } from './caseLinkModel.js';

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
test('Staff create-only clears password immediately and never calls approve', async () => {
  let finish, sent, approvals = 0;
  const actions = { listRecipients: async () => [recipient], listPending: async () => [], createAccount: data => { sent = data; return new Promise(resolve => { finish = resolve; }); }, approve: () => { approvals++; } };
  const v = await mount(Counter, { caseId: 'case-a', caseItem, accessToken: 'staff', actions });
  try {
    await change(v.host, 'form input:not([type])', 'Người C'); await change(v.host, 'input[type="email"]', 'c@example.test'); await change(v.host, 'input[type="password"]', 'fixture-only-password');
    await submit(v.host); assert.equal(v.host.querySelector('input[type="password"]').value, '');
    assert.equal(sent.fullName, 'Người C'); assert.equal('caseId' in sent, false);
    await act(async () => finish({ accountId: 'person-c', linked: false }));
    assert.equal(approvals, 0); assert.match(v.host.textContent, /Đã tạo tài khoản/);
  } finally { await v.close(); }
});
test('closed case makes no recipient or pending-request calls', async () => {
  let reads = 0;
  const v = await mount(Counter, { caseId: 'closed', caseItem: { status: 'CLOSED' }, actions: { listRecipients: async () => { reads++; return []; }, listPending: async () => { reads++; return []; } } });
  try { assert.equal(reads, 0); assert.equal(v.host.querySelector('select'), null); } finally { await v.close(); }
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
