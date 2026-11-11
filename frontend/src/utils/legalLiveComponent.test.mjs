import { distributionFixture } from './testFixtures/distribution.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
const dom = new JSDOM('<body></body>', { url: 'http://localhost/legal/death-verification' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const built = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: 'src/pages/legal/LegalLiveWorkflow.jsx', formats: ['es'] }, rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
let code = (Array.isArray(built) ? built[0] : built).output.find(item => item.type === 'chunk' && item.isEntry).code;
for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
const Screen = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const digest = 'a'.repeat(64), now = '2026-10-20T06:00:00Z';
const session = { accessToken: 'synthetic-test-only', expiresAt: Date.now() + 3600000, user: { id: a, fullName: 'Legal Test', roles: ['LEGAL_VERIFIER'] } };
const queue = [{ caseId: a, label: 'Case A', deathDocumentIds: [a] }, { caseId: b, label: 'Case B', deathDocumentIds: [b] }];
const props = element => element[Object.keys(element).find(key => key.startsWith('__reactProps'))];
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const base = { session, lang: 'en', caseId: a, discovery: async () => queue, contextLoader: async caseId => ({ caseId, deathDocuments: [{ id: caseId }], capabilities: { approval: { allowed: false }, unlock: { allowed: false } } }) };
async function selectDocument(host,id){const field=getSelect(host,'Death document');if(field)await change(field,id);else assert.equal(getSelect(host,'Death document'),undefined);}
async function mount(options = base) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const render = async value => { await act(async () => root.render(React.createElement(Screen, value))); };
  await render(options);
  return { host, render, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const change = async (element, value) => act(async () => props(element).onChange({ target: { value } }));
const choose = (host, value) => act(async () => props(host.querySelector(`input[type=radio][value="${value}"]`)).onChange());
const chosen = host => host.querySelector('input[type=radio]:checked')?.value || '';
const getSelect = (host, name) => [...host.querySelectorAll('label')].find(item => item.textContent.startsWith(name))?.querySelector('select');
const click = async (host, name) => act(async () => [...host.querySelectorAll('button')].find(item => item.textContent === name).click());
const submit = async host => act(async () => { props(host.querySelector('form')).onSubmit({ preventDefault() {} }); });
const detail = (id = a, changes = {}) => ({ deathDocumentPublicId: id, verificationCasePublicId: id, verificationCaseStatus: 'OPEN', vaultStatus: 'AWAITING_VERIFICATION', document: { issuingAuthority: 'Authority A', documentNumber: 'Doc A' }, decisions: [], ...changes });
const originalFetch = globalThis.fetch;

test('paper intake histories never bleed into another paper and a recorded conclusion cannot be recorded again',async()=>{
 let writes=0;const old={id:a,originalWillIntakeId:a,version:1,result:'MATCH',comparedAt:now};
 globalThis.fetch=async(_url,init)=>{if(init.method==='POST')writes++;return json({caseId:a,vaultStatus:'WILL_VERIFICATION',approvalBlocked:false,originalWillIntakes:[{id:b,receivedAt:'2026-10-31T08:00:00Z'},{id:a,receivedAt:now}],wills:[{id:a,versions:[{version:1,sha256:digest}]}],comparisons:[old]});};
 const v=await mount({...base,step:'will-document-verification'});try{const select=getSelect(v.host,'Original intake');assert.match(select.querySelector(`option[value="${b}"]`).textContent,/Intake 2/);assert.match(select.querySelector(`option[value="${a}"]`).textContent,/Intake 1/);
 await change(select,b);assert.match(v.host.textContent,/No conclusion has been recorded/);assert.equal(v.host.querySelector('.lv-legal-history-item'),null);await choose(v.host,'MISMATCH');await change(v.host.querySelector('textarea'),'New paper draft');await change(select,a);assert.match(v.host.textContent,/Saved conclusion/);assert.equal(v.host.querySelector('form'),null);assert.equal(v.host.querySelector('.lv-legal-workspace').classList.contains('is-single-column'),true);assert.equal(writes,0);
 await change(select,b);assert.equal(chosen(v.host),'');assert.equal(v.host.querySelector('.lv-legal-history-item'),null);assert.equal(v.host.querySelector('.lv-legal-workspace').classList.contains('is-single-column'),false);assert.ok(v.host.querySelector('.lv-legal-action-panel'));
 }finally{await v.close();}
});

test('focus revalidates other-role workflow changes and parent context without a page reload',async()=>{
 Object.defineProperty(document,'hidden',{configurable:true,value:false});
 let ready=false,contextReads=0;globalThis.fetch=async()=>json(workflowFixture(ready?'DOCUMENTS_UNDER_REVIEW':'AWAITING_DOCUMENTS','approveDocuments'));
 const v=await mount({...base,step:'basis-route-selection',contextLoader:async()=>{contextReads++;return distributionContext();}});try{assert.equal(v.host.querySelector('form'),null);const before=contextReads;ready=true;await act(async()=>window.dispatchEvent(new window.Event('focus')));assert.ok(contextReads>before);assert.ok(v.host.querySelector('form'));}finally{await v.close();}
});
test.afterEach(() => { globalThis.fetch = originalFetch; });

test('Explicitly disabled discovery remains unavailable without requests or fabricated success', async () => {
  globalThis.fetch = async () => assert.fail('No discovery endpoint may be invented');
  const view = await mount({ ...base, discovery: null });
  try { assert.match(view.host.textContent, /case list is not available/); assert.equal(view.host.querySelector('select').disabled, true); assert.equal(view.host.querySelector('input'), null); assert.equal(view.host.querySelector('form'), null); }
  finally { await view.close(); }
});
test('Role guard does not discover or mutate for Staff/Owner/Admin', async () => {
  for (const next of ['STAFF_EXECUTOR', 'VAULT_OWNER', 'ADMIN'].map(role => ({ ...session, user: { ...session.user, roles: [role] } }))) {
    const view = await mount({ ...base, session: next, discovery: async () => assert.fail('No discovery') });
    try { assert.match(view.host.textContent, /do not have permission/); assert.equal(view.host.querySelector('form'), null); } finally { await view.close(); }
  }
});

test('An expired session explains expiry and offers sign-in without making Legal requests', async () => {
  let signIns = 0;
  globalThis.fetch = async () => assert.fail('Expired sessions must not request private data');
  const view = await mount({ ...base, session: { ...session, expiresAt: 0 }, onUnauthorized: () => { signIns++; }, discovery: async () => assert.fail('No discovery') });
  try {
    assert.match(view.host.textContent, /session has expired/); assert.doesNotMatch(view.host.textContent, /do not have permission/);
    assert.equal(view.host.querySelector('form'), null); await click(view.host, 'Sign in again'); assert.equal(signIns, 1);
  } finally { await view.close(); }
});
test('Queue empty/error and invalid/cross-case discovery are not silently treated as ready', async () => {
  for (const discovery of [async () => [], async () => { throw { status: 403 }; }, async () => [{ caseId: 'bad' }]]) {
    const view = await mount({ ...base, discovery });
    try { assert.equal(view.host.querySelector('form'), null); assert.equal(view.host.querySelector('select').disabled, true); } finally { await view.close(); }
  }
});
test('Death decision requires selected server document; duplicate clicks locked, VI/EN draft kept and actual receipt shown', async () => {
  let writes = 0, finish, saved = false;
  globalThis.fetch = async (url, init) => init.method === 'POST' ? (writes++, new Promise(resolve => { finish = resolve; }))
    : url.endsWith('/attachments') ? json([]) : json(detail(a, saved ? { vaultStatus: 'DOCUMENT_VERIFICATION', decisions: [{ result: 'APPROVED', decidedAt: now }] } : {}));
  const view = await mount();
  try {
    assert.doesNotMatch(view.host.textContent, /Reload cases|Reload record|View latest status/);
    assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
    await selectDocument(view.host, a);
    await choose(view.host, 'APPROVE'); await change(view.host.querySelector('textarea'), 'Reviewed');
    await view.render({ ...base, lang: 'vi' }); assert.equal(view.host.querySelector('textarea').value, 'Reviewed');
    await submit(view.host); await submit(view.host); assert.equal(writes, 1);
    await act(async () => { saved = true; finish(json({ deathDocumentPublicId: a, verificationCasePublicId: a, verificationCaseStatus: 'OPEN', vaultStatus: 'DOCUMENT_VERIFICATION', result: 'APPROVED', verifierPublicId: a, decidedAt: now, reason: 'Reviewed' })); });
    assert.match(view.host.textContent, /Đã lưu quyết định/); assert.doesNotMatch(view.host.textContent, /Đã gửi thông báo cho Nhân viên/);
    assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
    assert.doesNotMatch(view.host.textContent, /Xem trạng thái mới/);
  } finally { await view.close(); }
});
test('Already decided death document cannot be decided again', async () => {
  globalThis.fetch = async () => json(detail(a, { decisions: [{ result: 'REJECTED', decidedAt: now, reason: 'Old', verifierPublicId: a }] }));
  const view = await mount();
  try { await selectDocument(view.host, a); assert.equal(view.host.querySelector('button[type=submit]').disabled, true); assert.match(view.host.textContent, /Rejected|Reject/); }
  finally { await view.close(); }
});
test('Changing case aborts delayed document response and removes old draft/receipt', async () => {
  let finish, signal;
  globalThis.fetch = async (_url, init) => new Promise(resolve => { finish = resolve; signal = init.signal; });
  const view = await mount();
  try {
    await selectDocument(view.host, a);
    const previousSignal=signal, finishPrevious=finish;
    await view.render({ ...base, caseId: b }); assert.equal(previousSignal.aborted, true);
    await act(async () => finishPrevious(json(detail())));
    assert.doesNotMatch(view.host.textContent, /Authority A/); assert.equal(getSelect(view.host, 'Death document'), undefined); assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
  } finally { await view.close(); }
});
test('409 and malformed response preserve draft but require reload before retry; unmount aborts mutation', async () => {
  let writes = 0, finish, signal;
  globalThis.fetch = async (_url, init) => init.method === 'POST' ? (++writes === 1 ? json({ code: 'LEGAL_VERIFICATION_ALREADY_DECIDED' }, 409) : new Promise(resolve => { finish = resolve; signal = init.signal; })) : json(detail());
  const view = await mount(); let closed = false;
  try {
    await selectDocument(view.host, a); await choose(view.host, 'REJECT'); await change(view.host.querySelector('textarea'), 'Keep this reason');
    await submit(view.host); assert.equal(view.host.querySelector('textarea').value, 'Keep this reason'); assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
    await click(view.host, 'Try again'); await submit(view.host); assert.equal(writes, 2);
    await view.close(); closed = true; assert.equal(signal.aborted, true); await act(async () => finish(json({})));
  } finally { if (!closed) await view.close(); }
});
test('Will picks original/version/hash from authorized overview, sends only contract fields', async () => {
  let body;
  globalThis.fetch = async (_url, init) => {
    if (init.method === 'POST') { body = JSON.parse(init.body); return json({ id: a, caseId: a, originalWillIntakeId: a, willId: a, version: 2, sha256: digest, result: 'MATCH', checkedBy: a, comparedAt: now }, 201); }
    return json({ caseId: a, vaultStatus: 'DOCUMENT_VERIFICATION', approvalBlocked: true, originalWillIntakes: [{ id: a, evidenceReference: 'Original paper' }], wills: [{ id: a, versions: [{ version: 2, sha256: digest }] }], comparisons: [] });
  };
  const view = await mount({ ...base, step: 'will-document-verification' });
  try {
    assert.equal(getSelect(view.host, 'Original intake'), undefined); assert.equal(getSelect(view.host, 'Digitized version'), undefined); await choose(view.host, 'MATCH');
    await submit(view.host); assert.deepEqual(body, { originalWillIntakeId: a, willId: a, version: 2, result: 'MATCH', reason: '' }); assert.match(view.host.textContent, /Decision saved|Supplementation requested/);
  } finally { await view.close(); }
});
test('unavailable distribution API never advertises final approval or unlock', async () => {
 globalThis.fetch=async()=>json({},404);
 for(const step of ['approval-review','controlled-unlock']) { const view=await mount({...base,step});try{assert.match(view.host.textContent,/unavailable|outside this account/);assert.equal(view.host.querySelector('form'),null);}finally{await view.close();} }
});

test('Saving automatically refreshes parent context and document while preserving the selected document and draft', async () => {
  let saved = false, contextReads = 0, documentReads = 0, finishContext;
  const context = () => ({ caseId: a, caseNumber: 'Case A', caseStatus: 'OPEN',
    vaultStatus: saved ? 'DOCUMENT_VERIFICATION' : 'AWAITING_VERIFICATION', deathDocuments: [{ id: a }], capabilities: {} });
  const decision = { result: 'APPROVED', decidedAt: now, reason: 'Reviewed', verifierPublicId: a };
  globalThis.fetch = async (url, init) => {
    if (init.method === 'POST') {
      saved = true;
      return json({ deathDocumentPublicId: a, verificationCasePublicId: a, verificationCaseStatus: 'OPEN',
        vaultStatus: 'DOCUMENT_VERIFICATION', ...decision });
    }
    if (url.endsWith('/attachments')) return json([]);
    // The stage chip also reads the distribution workflow; it is not a document read.
    if (url.includes('/distribution-workflow')) return new Response(JSON.stringify({ code: 'RESOURCE_NOT_FOUND' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    documentReads++;
    return json(detail(a, saved ? { vaultStatus: 'DOCUMENT_VERIFICATION', decisions: [decision] } : {}));
  };
  const contextLoader = async () => ++contextReads === 1 ? context() : new Promise(resolve => { finishContext = resolve; });
  const view = await mount({ ...base, contextLoader });
  try {
    await selectDocument(view.host, a);
    await choose(view.host, 'APPROVE'); await change(view.host.querySelector('textarea'), 'Reviewed');
    await submit(view.host);
    const previousReads = documentReads;
    assert.equal(contextReads, 2, 'The refresh must read the parent case context, not only the document');
    assert.equal(view.host.querySelector('.lv-staff-context-bar'), null, 'Old status must disappear while revalidating');
    assert.equal(view.host.querySelector('form'), null, 'No decision may be submitted during context revalidation');
    await act(async () => finishContext(context()));
    assert.match(view.host.querySelector('.lv-staff-context-badge').textContent, /Document verification/);
    assert.equal(getSelect(view.host, 'Death document'), undefined);
    assert.equal(view.host.querySelector('textarea').value, 'Reviewed');
    assert.equal(documentReads, previousReads + 1);
    assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
    assert.match(view.host.textContent, /Decision saved|Supplementation requested/);
    assert.doesNotMatch(view.host.textContent, /Checking the latest case/);
  } finally { await view.close(); }
});

for (const status of [403, 500]) test(`Retry revalidates parent context and hides old status/actions on HTTP ${status}`, async () => {
  let contextReads = 0;
  const contextLoader = async () => {
    if (++contextReads > 1) throw Object.assign(new Error('Context refresh failed'), { status });
    return { caseId: a, caseNumber: 'Case A', caseStatus: 'OPEN', vaultStatus: 'AWAITING_VERIFICATION', deathDocuments: [{ id: a }], capabilities: {} };
  };
  globalThis.fetch = async () => json({ code: 'READ_FAILED' }, 500);
  const view = await mount({ ...base, contextLoader });
  try {
    await selectDocument(view.host, a);
    await click(view.host, 'Try again');
    assert.equal(contextReads, 2);
    assert.equal(view.host.querySelector('.lv-staff-context-bar'), null);
    assert.equal(view.host.querySelector('form'), null);
    assert.ok(view.host.querySelector('[role=alert]'));
  } finally { await view.close(); }
});

test('Missing original will shows the next step instead of an empty intake selector; archived cases remain read-only', async () => {
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.method, 'GET');
    return json({ caseId: a, vaultStatus: 'DOCUMENT_VERIFICATION', approvalBlocked: true, originalWillIntakes: [], wills: [], comparisons: [] });
  };
  const view = await mount({ ...base, step: 'will-document-verification' });
  try {
    assert.match(view.host.textContent, /No original paper will has been received/);
    assert.match(view.host.textContent, /Staff must record the original paper will/);
    assert.equal(getSelect(view.host, 'Original intake'), undefined);
    assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
    await view.render({ ...base, step: 'will-document-verification', lang: 'vi', contextLoader: async caseId => ({
      caseId, caseStatus: 'CLOSED', vaultStatus: 'ARCHIVED', deathDocuments: [], capabilities: {},
    }) });
    assert.match(view.host.textContent, /chưa có di chúc bản cứng được tiếp nhận/);
    assert.doesNotMatch(view.host.textContent, /Nhân viên cần ghi nhận tiếp nhận/);
    assert.equal(getSelect(view.host, 'Bản gốc đã tiếp nhận'), undefined);
    assert.equal(view.host.querySelector('form'), null);
  } finally { await view.close(); }
});

const makeDossier = (route = 'COURT') => ({ id: a, caseId: a, route, status: 'LEGAL_BASIS_FORWARDED', disputeStatus: 'NONE', requiredVersion: 1,
  versions: [{ version: 1, sha256: digest, forwardStatus: 'FORWARDED', documentNumber: 'Basis 1' }], classifiedBy: a });
const distributionContext=()=>({caseId:a,vaultId:b,caseStatus:'OPEN',vaultStatus:'LEGAL_BASIS_VERIFICATION',deathDocuments:[],willComparison:{latestResult:'MATCH',approvalBlocked:false},basisDossier:makeDossier(),snapshot:{allocationHash:digest},capabilities:{approval:{allowed:false},unlock:{allowed:false}}});
test('a stale supplementation action followed by waiting-for-documents hides old decisions and explains what Staff must do',async()=>{
 let waiting=false;
 globalThis.fetch=async(url,init)=>{
  if(init.method==='POST'){waiting=true;return json({code:'DISTRIBUTION_WORKFLOW_STALE'},409);}
  const value=workflowFixture(waiting?'AWAITING_DOCUMENTS':'DOCUMENTS_UNDER_REVIEW',waiting?'uploadDocuments':'requestDocumentSupplementation');
  if(waiting){value.document.status='CHANGES_REQUESTED';value.feedback='Replace the missing page';value.revision=2;}
  return json(url.endsWith('/distribution-workflow')?value:[]);
 };
 const view=await mount({...base,step:'basis-route-selection',contextLoader:async()=>distributionContext()});
 try{
  await change(view.host.querySelector('.lv-legal-basis-decision textarea'),'Supplement draft');
  await click(view.host,'Request more documents');
  assert.equal(view.host.querySelector('.lv-legal-basis-decision'),null);
  assert.match(view.host.textContent,/Waiting for a new document version/);
  assert.match(view.host.textContent,/previous action was not saved/);
  assert.match(view.host.textContent,/Replace the missing page/);
 }finally{await view.close();}
});
test('waiting for replacement documents does not relabel earlier allocation feedback as a document request',async()=>{
 const value=workflowFixture('AWAITING_DOCUMENTS','uploadDocuments');
 value.document.status='APPROVED';
 value.allocation={...value.allocation,status:'CHANGES_REQUESTED'};
 value.feedback='Correct the recipient allocation';
 globalThis.fetch=async url=>json(url.endsWith('/distribution-workflow')?value:[]);
 const view=await mount({...base,step:'basis-route-selection',contextLoader:async()=>distributionContext()});
 try{
  assert.match(view.host.textContent,/Latest assessment/);
  assert.match(view.host.textContent,/Correct the recipient allocation/);
  assert.doesNotMatch(view.host.textContent,/Reason for additional documents/);
 }finally{await view.close();}
});

test('basis review keeps pause controls inside the result panel with separate forms and drafts',async()=>{
 let writes=0;const value=workflowFixture('DOCUMENTS_UNDER_REVIEW','approveDocuments');
 globalThis.fetch=async(url,init)=>{if(init.method==='POST')writes++;return json(url.endsWith('/distribution-workflow')?value:[]);};
 const view=await mount({...base,step:'basis-route-selection',contextLoader:async()=>distributionContext()});
 try {
  const workspace=view.host.querySelector('.lv-legal-basis-workspace.is-review');
  const result=workspace.querySelector('.lv-legal-basis-decision');
  assert.ok(workspace.querySelector('.lv-legal-basis-source .lv-legal-basis-evidence'));
  assert.ok(result.querySelector('.lv-legal-basis-hold-footer .lv-legal-hold-controls'));
  const review=result.querySelector('textarea');await change(review,'Assessment draft');
  await click(view.host,'Place case on hold');
  const pause=result.querySelector('.lv-legal-hold-controls');
  assert.equal(result.querySelectorAll('form').length,2);
  assert.equal(result.querySelector('form form'),null);
  await choose(pause,'INSUFFICIENT_EVIDENCE');
  await change(pause.querySelector('textarea'),'Pause draft');
  assert.equal(review.value,'Assessment draft');
  await click(view.host,'Place case on hold');await click(view.host,'Place case on hold');
  assert.equal(pause.querySelector('textarea').value,'Pause draft');
  assert.equal(review.value,'Assessment draft');assert.equal(writes,0);
 }finally{await view.close();}
});
function workflowFixture(phase,action){const value=distributionFixture(distributionContext(),phase);if(phase==='DOCUMENT_REQUEST_NEEDED'){value.request=null;value.document=null;value.allocation=null;}else if(phase==='DOCUMENTS_UNDER_REVIEW'){value.document.status='PENDING';value.allocation=null;}else if(phase==='ALLOCATIONS_UNDER_REVIEW')value.allocation.status='SUBMITTED';value.capabilities[action]={allowed:true,blockedReason:null};return value;}
test('unimplemented workflow has no route selector or fabricated action',async()=>{globalThis.fetch=async()=>json({},404);const view=await mount({...base,step:'basis-route-selection'});try{assert.equal(getSelect(view.host,'Legal basis'),undefined);assert.equal(view.host.querySelector('form'),null);assert.match(view.host.textContent,/unavailable|outside this account/);}finally{await view.close();}});
for(const [action,phase,title,path] of [
 ['requestDocuments','DOCUMENT_REQUEST_NEEDED','Request distribution documents','request-documents'],
 ['approveDocuments','DOCUMENTS_UNDER_REVIEW','Accept documents','approve-documents'],
 ['requestDocumentSupplementation','DOCUMENTS_UNDER_REVIEW','Request more documents','request-document-supplementation'],
 ['approveAllocations','ALLOCATIONS_UNDER_REVIEW','Accept allocations','approve-allocations'],
 ['requestAllocationChanges','ALLOCATIONS_UNDER_REVIEW','Request allocation corrections','request-allocation-changes'],
])test(action+' saves a separate reasoned action without final approval or unlock',async()=>{
 let writes=0,body,destination;const value=workflowFixture(phase,action);
 globalThis.fetch=async(url,init)=>{if(init.method==='POST'){writes++;destination=url;body=JSON.parse(init.body);return json({caseId:a,action,revision:2});}return url.endsWith('/distribution-workflow')?json(value):json([]);};
 const view=await mount({...base,step:'basis-route-selection',contextLoader:async()=>distributionContext()});
 try{assert.equal(getSelect(view.host,'Legal basis'),undefined);const target=[...view.host.querySelectorAll('button')].find(x=>x.textContent===title);assert.equal(target.disabled,true);if(action==='requestDocuments')await change(getSelect(view.host,'Document requirement'),'DISTRIBUTION');await change(view.host.querySelector('textarea'),'Reviewed');await click(view.host,title);assert.equal(writes,1);assert.ok(destination.endsWith('/'+path));assert.equal(body.reason,action==='requestDocuments'?'Documents requested: Valid asset distribution documents\nReason: Reviewed':'Reviewed');assert.equal(body.revision,1);assert.equal(Object.hasOwn(body,'route'),false);assert.doesNotMatch(destination,/basis-dossier\/decision$|\/unlock$/);if(action==='requestDocuments')assert.equal(Object.hasOwn(body,'documentVersion'),false);if(phase==='ALLOCATIONS_UNDER_REVIEW'){assert.equal(body.allocationVersion,1);assert.match(view.host.textContent,/Stored asset|Case recipient/);}assert.doesNotMatch(view.host.textContent,/notification has been sent/);}finally{await view.close();}
});
for (const lang of ['vi', 'en']) test(`document request (${lang}) requires a selection and reason and sends both through the existing contract`, async () => {
  const en = lang === 'en', value = workflowFixture('DOCUMENT_REQUEST_NEEDED', 'requestDocuments');
  let writes = 0, body;
  globalThis.fetch = async (url, init) => {
    if (init.method === 'POST') { writes++; body = JSON.parse(init.body); return json({ caseId: a, action: 'requestDocuments', revision: 2 }); }
    return url.endsWith('/distribution-workflow') ? json(value) : json([]);
  };
  const view = await mount({ ...base, step: 'basis-route-selection', lang, contextLoader: async () => distributionContext() });
  try {
    const form = view.host.querySelector('.lv-legal-document-request');
    assert.equal(form.querySelectorAll(':scope > section').length, 2);
    const select = getSelect(view.host, en ? 'Document requirement' : 'Giấy tờ yêu cầu');
    assert.equal(select.value, '');
    assert.ok(![...select.options].some(option => ['COURT', 'NOTARIAL'].includes(option.value)), 'Document selection must not impose a legal route');
    await change(view.host.querySelector('textarea'), 'Cần làm rõ phần được hưởng');
    await submit(view.host); assert.equal(writes, 0, 'A reason alone cannot submit the request');
    await change(select, 'DISTRIBUTION');
    await submit(view.host);
    assert.equal(writes, 1);
    assert.deepEqual(body, { revision: 1, reason: en
      ? 'Documents requested: Valid asset distribution documents\nReason: Cần làm rõ phần được hưởng'
      : 'Giấy tờ cần nộp: Giấy tờ phân chia tài sản hợp lệ\nLý do: Cần làm rõ phần được hưởng' });
  } finally { await view.close(); }
});

test('custom document name and reason survive errors and refresh but clear on account change', async () => {
  const value = workflowFixture('DOCUMENT_REQUEST_NEEDED', 'requestDocuments'); let writes = 0;
  globalThis.fetch = async (url, init) => {
    if (init.method === 'POST') { writes++; return json({ code: 'INTERNAL_ERROR' }, 500); }
    return url.endsWith('/distribution-workflow') ? json(value) : json([]);
  };
  const options = { ...base, step: 'basis-route-selection', contextLoader: async () => distributionContext() };
  const view = await mount(options);
  try {
    await change(getSelect(view.host, 'Document requirement'), 'OTHER');
    await change(view.host.querySelector('textarea'), 'Clarify the supporting document');
    await submit(view.host); assert.equal(writes, 0, 'Other documents require an explicit name');
    await change(view.host.querySelector('.lv-legal-document-request input[type=text]'), 'Supporting distribution record');
    await submit(view.host); assert.equal(writes, 1);
    assert.match(view.host.textContent, /could not be saved/);
    await click(view.host, 'Refresh documents and case');
    assert.equal(getSelect(view.host, 'Document requirement').value, 'OTHER');
    assert.equal(view.host.querySelector('input[type=text]').value, 'Supporting distribution record');
    assert.equal(view.host.querySelector('textarea').value, 'Clarify the supporting document');
    await view.render({ ...options, session: { ...session, accessToken: 'another-account-fixture' } });
    assert.equal(getSelect(view.host, 'Document requirement').value, '');
    assert.equal(view.host.querySelector('input[type=text]'), null);
    assert.equal(view.host.querySelector('textarea').value, '');
  } finally { await view.close(); }
});

test('the combined selected document and reason must fit the server limit', async () => {
  const value = workflowFixture('DOCUMENT_REQUEST_NEEDED', 'requestDocuments'); let writes = 0;
  globalThis.fetch = async (url, init) => { if (init.method === 'POST') writes++; return json(url.endsWith('/distribution-workflow') ? value : []); };
  const view = await mount({ ...base, step: 'basis-route-selection', contextLoader: async () => distributionContext() });
  try {
    await change(getSelect(view.host, 'Document requirement'), 'DISTRIBUTION');
    const field = view.host.querySelector('textarea');
    assert.ok(field.maxLength < 1000, 'Reserve space for the selected document in the existing reason field');
    await change(field, 'x'.repeat(1000));
    assert.equal(field.getAttribute('aria-invalid'), 'true');
    await submit(view.host); assert.equal(writes, 0);
  } finally { await view.close(); }
});

test('changed distribution revision blocks POST and retains the review reason',async()=>{let reads=0,writes=0;const value=workflowFixture('DOCUMENTS_UNDER_REVIEW','approveDocuments');globalThis.fetch=async(url,init)=>{if(init.method==='POST'){writes++;return json({});}return url.endsWith('/distribution-workflow')?json({...value,revision:++reads>1?2:1}):json([]);};const view=await mount({...base,step:'basis-route-selection',contextLoader:async()=>distributionContext()});try{await change(view.host.querySelector('textarea'),'Keep this reason');await click(view.host,'Accept documents');assert.equal(writes,0);assert.match(view.host.textContent,/case changed/);assert.equal(view.host.querySelector('textarea').value,'Keep this reason');}finally{await view.close();}});
test('waiting for Staff documents or allocations exposes no premature Legal action',async()=>{for(const phase of ['AWAITING_DOCUMENTS','AWAITING_ALLOCATIONS']){globalThis.fetch=async()=>json(workflowFixture(phase,'approveDocuments'));const view=await mount({...base,step:'basis-route-selection',contextLoader:async()=>distributionContext()});try{assert.equal(view.host.querySelector('form'),null);}finally{await view.close();}}});

for (const failure of [403, 404, 500, 'network', 'invalid']) test(`Discovery revalidation ${failure}: removes old case before completion and stays locked on failure`, async () => {
  let writes = 0, finish, reads = 0;
  globalThis.fetch = async (_url, init) => { if (init.method === 'POST') writes++; return json(detail()); };
  const view = await mount();
  try {
    await selectDocument(view.host, a);
    await choose(view.host, 'APPROVE'); await change(view.host.querySelector('textarea'), 'Old case draft');
    assert.equal(view.host.querySelector('button[type=submit]').disabled, false);
    const discovery = () => { reads++; return new Promise((resolve, reject) => { finish = { resolve, reject }; }); };
    await view.render({ ...base, discovery });
    assert.match(view.host.textContent, /Loading cases/);
    assert.equal(view.host.querySelector('form'), null, 'Pending permission verification must unmount the old form');
    assert.equal(view.host.querySelector('select').disabled, true); assert.doesNotMatch(view.host.textContent, /Authority A/);
    await act(async () => {
      if (failure === 'invalid') finish.resolve([{ caseId: 'invalid' }]);
      else finish.reject(failure === 'network' ? new Error('network') : Object.assign(new Error('failed'), { status: failure }));
    });
    assert.ok(view.host.querySelector('[role=alert]')); assert.equal(view.host.querySelector('form'), null);
    assert.equal(view.host.querySelector('select').disabled, true); assert.equal(writes, 0);
    await click(view.host, 'Retry');
    assert.equal(view.host.querySelector('form'), null, 'Retry must stay locked until successful authorization');
    assert.equal(view.host.querySelector('select').disabled, true);
    await act(async () => finish.resolve(queue));
    assert.equal(reads, 2); assert.ok(view.host.querySelector('form'));
    assert.equal(view.host.querySelector('textarea').value, '', 'Old draft must not survive revoked/unknown authorization');
    assert.equal(getSelect(view.host, 'Death document'), undefined); assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
  } finally { await view.close(); }
});
test('Session revalidation aborts pending decision and late success cannot restore private case after 403', async () => {
  let finishWrite, signal, finishQueue;
  globalThis.fetch = async (_url, init) => init.method === 'POST' ? new Promise(resolve => { finishWrite = resolve; signal = init.signal; }) : json(detail());
  const discovery = async ({ accessToken }) => accessToken === session.accessToken ? queue : new Promise((_resolve, reject) => { finishQueue = reject; });
  const view = await mount({ ...base, discovery });
  try {
    await selectDocument(view.host, a); await choose(view.host, 'APPROVE'); await change(view.host.querySelector('textarea'), 'Reviewed');
    await submit(view.host); assert.ok(signal); assert.equal(signal.aborted, false);
    await view.render({ ...base, discovery, session: { ...session, accessToken: 'new-token' } });
    assert.equal(signal.aborted, true); assert.equal(view.host.querySelector('form'), null);
    await act(async () => finishQueue(Object.assign(new Error('denied'), { status: 403 })));
    await act(async () => finishWrite(json({ deathDocumentPublicId: a, verificationCasePublicId: a, verificationCaseStatus: 'OPEN', vaultStatus: 'DOCUMENT_VERIFICATION', result: 'APPROVED', verifierPublicId: a, decidedAt: now, reason: 'Reviewed' })));
    assert.ok(view.host.querySelector('[role=alert]')); assert.equal(view.host.querySelector('form'), null); assert.doesNotMatch(view.host.textContent, /Decision saved|Authority A/);
  } finally { await view.close(); }
});
test('Removing discovery while case is open clears the old case and disables selection immediately', async () => {
  globalThis.fetch = async () => json(detail());
  const view = await mount();
  try { await selectDocument(view.host, a); await view.render({ ...base, discovery: null });
    assert.equal(view.host.querySelector('form'), null); assert.equal(view.host.querySelector('select').disabled, true); assert.doesNotMatch(view.host.textContent, /Authority A/); }
  finally { await view.close(); }
});

test('a successful waiting workflow keeps a refresh action and loads the other role latest phase', async () => {
  let ready = false, reads = 0;
  globalThis.fetch = async url => {
    if (url.endsWith('/distribution-workflow')) { reads++; return json(workflowFixture(ready ? 'DOCUMENTS_UNDER_REVIEW' : 'AWAITING_DOCUMENTS', 'approveDocuments')); }
    return json([]);
  };
  const view = await mount({...base,step:'basis-route-selection',contextLoader:async()=>distributionContext()});
  try {
    assert.equal(view.host.querySelector('form'),null);
    const before = reads; ready = true;
    assert.equal(view.host.querySelector('.lv-distribution-refresh'), null, 'Legal has one refresh action for documents and workflow together');
    await click(view.host,'Refresh documents and case');
    assert.ok(reads > before);
    assert.ok(view.host.querySelector('form'));
    assert.ok([...view.host.querySelectorAll('button')].some(button=>button.textContent==='Accept documents'));
  } finally {await view.close();}
});

test('Legal can refresh newly uploaded death documents while preserving an unfinished assessment', async () => {
  let extra = false, reads = 0;
  const contextLoader = async () => { reads++; return { caseId: a, deathDocuments: extra ? [{ id: a }, { id: b }] : [{ id: a }] }; };
  globalThis.fetch = async url => url.endsWith('/attachments') ? json([]) : json(detail());
  const view = await mount({ ...base, contextLoader });
  try {
    await choose(view.host, 'REQUEST_MORE');
    await change(view.host.querySelector('textarea'), 'Please clarify the issuing authority');
    extra = true;
    await click(view.host, 'Refresh documents and case');
    assert.equal(reads, 2);
    assert.equal(getSelect(view.host, 'Death document').querySelectorAll('option').length, 3);
    assert.equal(view.host.querySelector('textarea').value, 'Please clarify the issuing authority');
    assert.equal(chosen(view.host), 'REQUEST_MORE');
  } finally { await view.close(); }
});

test('the shared case bar and refresh stay in one inline row without changing the refresh operation', async () => {
  let reads=0;
  globalThis.fetch=async url=>url.endsWith('/attachments')?json([]):json(detail());
  const view=await mount({...base,contextLoader:async()=>{reads++;return {caseId:a,caseNumber:'CASE-352',deathDocuments:[{id:a}]};}});
  try {
    const row=view.host.querySelector('.lv-legal-context-row');
    assert.ok(row.querySelector('.lv-staff-context-bar'));
    assert.equal(row.querySelectorAll('.lv-legal-context-actions button').length,1);
    const before=reads;
    await click(view.host,'Refresh documents and case');
    assert.equal(reads,before+1);
    assert.ok(view.host.querySelector('.lv-legal-context-row .lv-staff-context-bar'));
  } finally {await view.close();}
});
