import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';

const dom = new JSDOM('<body></body>', { url: 'http://localhost' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const built = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: 'src/workflows/DistributionWorkflowOverview.jsx', formats: ['es'] }, rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
let code = (Array.isArray(built) ? built[0] : built).output.find(x => x.type === 'chunk' && x.isEntry).code;
for (const pkg of ['react', 'react/jsx-runtime']) code = code.replaceAll(`from "${pkg}"`, `from "${import.meta.resolve(pkg)}"`);
const Overview = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;

const caseId = '12345678-1234-4234-8234-123456789012';
async function show(data, workspace = 'STAFF', lang = 'vi') {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Overview, { workflow: { data }, workspace, lang, showRefresh: false })));
  const text = host.textContent, link = host.querySelector('a')?.getAttribute('href');
  await act(async () => root.unmount());
  host.remove();
  return { text, link };
}

test('Staff sees which death/will check is still missing and a link back to the case when prerequisites are pending', async () => {
  const result = await show({ caseId, phase: 'PREREQUISITES_PENDING', prerequisites: { deathApproved: true, willMatched: false } });
  assert.match(result.text, /Chưa đến bước này/);
  assert.match(result.text, /Giấy tờ tử vong: Ban Pháp lý đã chấp thuận/);
  assert.match(result.text, /Di chúc gốc: chưa đối chiếu khớp/);
  assert.equal(result.link, `/staff/cases?caseId=${caseId}`);
});

test('the pending-prerequisites notice is Staff only and gives way to the next stage', async () => {
  assert.doesNotMatch((await show({ caseId, phase: 'PREREQUISITES_PENDING', prerequisites: { deathApproved: false, willMatched: false } }, 'LEGAL')).text, /Chưa đến bước này/);
  assert.match((await show({ caseId, phase: 'DOCUMENT_REQUEST_NEEDED', prerequisites: { deathApproved: true, willMatched: true } })).text, /Chờ Ban Pháp lý gửi yêu cầu/);
  assert.equal((await show({ caseId, phase: 'AWAITING_DOCUMENTS', prerequisites: { deathApproved: true, willMatched: true } })).text, '');
});
