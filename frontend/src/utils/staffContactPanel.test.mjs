import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import { fetchCaseContacts, recordTrusteeContact } from '../pages/staff/staffContactService.js';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/staff/cases' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const built = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: 'src/pages/staff/StaffContactPanel.jsx', formats: ['es'] }, rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
let code = (Array.isArray(built) ? built[0] : built).output.find(x => x.type === 'chunk' && x.isEntry).code;
for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
const { default: Panel } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

const caseId = '12345678-1234-4234-8234-123456789012';
const trusteeId = '22222222-2222-4222-8222-222222222222';
const beneficiaryId = '33333333-3333-4333-8333-333333333333';
const recordId = '44444444-4444-4444-8444-444444444444';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const trustee = (contacts = []) => ({ kind: 'TRUSTEE', id: trusteeId, fullName: 'Dương Văn Tâm', relationship: 'Em trai chủ kho', phone: '0903456789', email: 'tam@example.com', canRecord: true, contacts });
const beneficiary = { kind: 'BENEFICIARY', id: beneficiaryId, fullName: 'Dương Thị Lan', relationship: 'Con gái', phone: '0912345678', email: 'lan@example.com', canRecord: false, contacts: [] };
const record = (outcome = 'CONTACTED', note = null) => ({ id: recordId, trusteeId, channel: 'PHONE', outcome, fallbackStatus: outcome === 'CONTACTED' ? 'NOT_REQUIRED' : 'REQUIRED', note, occurredAt: '2026-11-12T03:00:00Z' });
const reactProps = element => element[Object.keys(element).find(key => key.startsWith('__reactProps$'))];
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text));
async function mount(extra = {}) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(React.createElement(Panel, { caseId, accessToken: 'synthetic', lang: 'vi', ...extra })));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  return { host, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}

test('the panel lists the executor then the beneficiaries from the server, with no sample-data label', async () => {
  const urls = [];
  globalThis.fetch = async url => { urls.push(url); return json({ caseId, people: [trustee(), beneficiary] }); };
  const v = await mount();
  try {
    assert.match(urls[0], new RegExp(`/staff/verification-cases/${caseId}/contacts$`));
    const names = [...v.host.querySelectorAll('.lv-contact__who strong')].map(node => node.textContent);
    assert.deepEqual(names, ['Dương Văn Tâm', 'Dương Thị Lan']);
    assert.equal(v.host.querySelector('a[href="tel:0903456789"]').textContent, '0903456789');
    assert.equal(v.host.querySelector('a[href="mailto:lan@example.com"]').textContent, 'lan@example.com');
    assert.match(v.host.querySelector('.lv-contact__summary').textContent, /0\/1 đã liên hệ được/);
    assert.equal(v.host.querySelectorAll('.lv-contact__record').length, 1, 'only the executor can be logged');
    assert.equal(v.host.textContent.includes('minh họa'), false);
  } finally { await v.close(); }
});

test('logging a contact posts the executor outcome and shows the saved result after reloading', async () => {
  const posts = []; let saved = null;
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === 'POST') { posts.push({ url, body: JSON.parse(init.body) }); saved = record('CONTACTED', 'Hẹn mang giấy tờ'); return json(saved, 201); }
    return json({ caseId, people: [trustee(saved ? [saved] : []), beneficiary] });
  };
  const v = await mount();
  try {
    await act(async () => button(v.host, 'Ghi nhận liên hệ').click());
    const note = v.host.querySelector('textarea');
    await act(async () => reactProps(note).onChange({ target: { value: 'Hẹn mang giấy tờ' } }));
    await act(async () => { v.host.querySelector('.lv-contact__save').click(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(posts.length, 1);
    assert.match(posts[0].url, new RegExp(`/staff/trustees/${trusteeId}/contact-outcomes$`));
    assert.deepEqual(posts[0].body, { channel: 'PHONE', outcome: 'CONTACTED', fallbackStatus: 'NOT_REQUIRED', note: 'Hẹn mang giấy tờ' });
    assert.match(v.host.querySelector('.lv-contact__status').textContent, /Đã liên hệ/);
    assert.match(v.host.querySelector('.lv-contact__last').textContent, /Hẹn mang giấy tờ/);
    assert.match(v.host.querySelector('.lv-contact__summary').textContent, /1\/1 đã liên hệ được/);
  } finally { await v.close(); }
});

test('when every executor was tried and nobody answered the panel asks for a fallback', async () => {
  globalThis.fetch = async () => json({ caseId, people: [trustee([record('NO_RESPONSE')]), beneficiary] });
  const v = await mount();
  try {
    assert.match(v.host.querySelector('[role=alert]').textContent, /Chưa liên hệ được ai/);
    assert.match(v.host.querySelector('.lv-contact__status').textContent, /Chưa phản hồi/);
  } finally { await v.close(); }
});

test('a case that is not assigned to this Staff shows the access message instead of people', async () => {
  globalThis.fetch = async () => json({ code: 'RESOURCE_NOT_FOUND' }, 404);
  const v = await mount();
  try {
    assert.match(v.host.querySelector('[role=alert]').textContent, /Không truy cập được hồ sơ/);
    assert.equal(v.host.querySelector('.lv-contact__list'), null);
  } finally { await v.close(); }
});

test('an empty case says so, and a failed save keeps the form open with the error', async () => {
  globalThis.fetch = async () => json({ caseId, people: [] });
  const empty = await mount();
  try { assert.match(empty.host.textContent, /chưa có người thi hành hoặc người thụ hưởng/); } finally { await empty.close(); }
  globalThis.fetch = async (url, init = {}) => init.method === 'POST' ? json({ code: 'TRUSTEE_REVOKED' }, 409) : json({ caseId, people: [trustee()] });
  const v = await mount();
  try {
    await act(async () => button(v.host, 'Ghi nhận liên hệ').click());
    await act(async () => { v.host.querySelector('.lv-contact__save').click(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.ok(v.host.querySelector('.lv-contact__form'));
    assert.ok(v.host.querySelector('.lv-contact__error'));
  } finally { await v.close(); }
});

test('the contact service rejects malformed ids, values and responses', async () => {
  await assert.rejects(() => fetchCaseContacts('not-a-uuid'), { code: 'VALIDATION_FAILED' });
  await assert.rejects(() => recordTrusteeContact('x', { channel: 'PHONE', outcome: 'CONTACTED', fallbackStatus: 'NOT_REQUIRED' }), { code: 'VALIDATION_FAILED' });
  await assert.rejects(() => recordTrusteeContact(trusteeId, { channel: 'FAX', outcome: 'CONTACTED', fallbackStatus: 'NOT_REQUIRED' }), { code: 'VALIDATION_FAILED' });
  await assert.rejects(() => recordTrusteeContact(trusteeId, { channel: 'PHONE', outcome: 'CONTACTED', fallbackStatus: 'NOT_REQUIRED', note: 'x'.repeat(501) }), { code: 'VALIDATION_FAILED' });
  globalThis.fetch = async () => json({ caseId: 'other', people: [] });
  await assert.rejects(() => fetchCaseContacts(caseId), { code: 'INVALID_RESPONSE' });
  globalThis.fetch = async () => json({ caseId, people: [{ kind: 'TRUSTEE', id: trusteeId, fullName: 'A', contacts: [{ id: 'bad' }] }] });
  await assert.rejects(() => fetchCaseContacts(caseId), { code: 'INVALID_RESPONSE' });
});
