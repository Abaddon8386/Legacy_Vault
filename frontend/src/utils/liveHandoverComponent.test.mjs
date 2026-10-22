import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
const dom = new JSDOM('<body></body>', { url: 'http://localhost/account/profile' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.attachEvent=()=>{};
dom.window.HTMLElement.prototype.detachEvent=()=>{};
dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
async function loadComponentModule(entry, production = false) {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    define: {
      'import.meta.env.DEV': String(!production),
      'import.meta.env.PROD': String(production),
    },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}


const {default:Page}=await loadComponentModule('src/pages/staff/LiveHandoverPage.jsx');
const cid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const receipt={caseId:cid,sessionId:sid,vaultId:cid,staffId:cid,status:'OPEN',openedAt:'2026-10-20T06:00:00',closedAt:null};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const props=e=>e[Object.keys(e).find(k=>k.startsWith('__reactProps$'))];
const btn=(host,text)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
async function mount(extra={},url='/staff/handover?caseId='+cid){window.history.replaceState({},'',url);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const options={accessToken:'synthetic',lang:'vi',onLogout(){},...extra};await act(async()=>root.render(React.createElement(Page,options)));return{host,root,options,close:async()=>{await act(async()=>root.unmount());host.remove();}};}
test('Open uses pending lock, server receipt, query context and VI/EN state; accounts remain blocked',async()=>{
 let release,writes=0;globalThis.fetch=async(url,init)=>{if(init.method==='POST'){writes++;return new Promise(r=>{release=r;});}return json([]);};
 const v=await mount();const open=btn(v.host,'Mở phiên bàn giao');assert.equal(open.disabled,false);
 await act(async()=>{open.click();open.click();});assert.equal(writes,1);assert.ok(v.host.querySelector('progress'));
 await act(async()=>release(json(receipt,201)));assert.match(v.host.textContent,/Máy chủ đã xác nhận/);
 assert.equal(new URLSearchParams(window.location.search).get('sessionId'),sid);assert.equal(btn(v.host,'Mở phiên bàn giao').disabled,true);
 const assetLinks=[...v.host.querySelectorAll('a.lv-handover-primary-action')];
 assert.equal(assetLinks.length,2);
 for(const link of assetLinks){assert.equal(link.pathname,'/staff/asset-handover');assert.equal(link.search,'?caseId='+cid+'&sessionId='+sid);assert.match(link.textContent,/Chọn tài sản bàn giao/);}
 assert.equal(btn(v.host,'Tạo / liên kết tài khoản người thụ hưởng').disabled,true);
 const link=[...v.host.querySelectorAll('a')].find(a=>a.pathname==='/staff/beneficiary-accounts');assert.equal(link.search,'?caseId='+cid+'&sessionId='+sid);
 await act(async()=>v.root.render(React.createElement(Page,{...v.options,lang:'en'})));assert.ok(v.host.textContent.includes(sid));assert.equal(btn(v.host,'Open handover session').disabled,true);await v.close();
});
test('Existing OPEN restored via list/detail; cancellation only after confirmation and server response',async()=>{
 const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,init});return json(init.method==='PATCH'?{...receipt,status:'CANCELLED',closedAt:'2026-10-20T07:00:00'}:url.endsWith(sid)?receipt:[receipt]);};
 const v=await mount();assert.equal(btn(v.host,'Mở phiên bàn giao').disabled,true);assert.equal(calls.filter(c=>c.init.method==='POST').length,0);
 await act(async()=>btn(v.host,'Hủy phiên…').click());assert.equal(calls.filter(c=>c.init.method==='PATCH').length,0);
 await act(async()=>btn(v.host,'Xác nhận hủy').click());assert.match(v.host.textContent,/Đã hủy/);assert.equal(btn(v.host,'Hủy phiên…').disabled,true);
 assert.deepEqual(JSON.parse(calls.find(c=>c.init.method==='PATCH').init.body),{status:'CANCELLED'});await v.close();
});
test('409 open race requires reload and adopts server session without retrying POST',async()=>{
 let opens=0,lists=0;globalThis.fetch=async(url,init)=>{if(init.method==='POST'){opens++;return json({code:'HANDOVER_SESSION_ALREADY_OPEN'},409);}if(url.endsWith(sid))return json(receipt);return json(++lists===1?[]:[receipt]);};
 const v=await mount();await act(async()=>btn(v.host,'Mở phiên bàn giao').click());assert.match(v.host.querySelector('[role=alert]').textContent,/Đã có phiên mở/);assert.equal(btn(v.host,'Mở phiên bàn giao').disabled,true);
 await act(async()=>btn(v.host,'Tải lại phiên').click());assert.ok(v.host.textContent.includes(sid));assert.equal(opens,1);await v.close();
});
test('401 notifies logout; no fake account data; closed session is read-only in accounts mode',async()=>{
 let expired=0;globalThis.fetch=async()=>json({code:'UNAUTHENTICATED'},401);let v=await mount({onLogout(){expired++;}});assert.equal(expired,1);assert.match(v.host.textContent,/hết hạn/);await v.close();
 const completed={...receipt,status:'COMPLETED',closedAt:'2026-10-20T07:00:00'};globalThis.fetch=async(url)=>json(url.endsWith(sid)?completed:[completed]);
 v=await mount({mode:'accounts'},'/staff/beneficiary-accounts?caseId='+cid+'&sessionId='+sid);assert.match(v.host.textContent,/Hoàn tất/);assert.match(v.host.textContent,/PS-88/);assert.equal(btn(v.host,'Tạo / liên kết tài khoản người thụ hưởng').disabled,true);assert.equal(btn(v.host,'Hủy phiên…').disabled,true);await v.close();
});
test('Switching case aborts previous reads and ignores late responses; unmount aborts writes',async()=>{
 let release,signal;globalThis.fetch=async(url,init)=>{if(url.includes('/handover-sessions')){signal=init.signal;return new Promise(r=>{release=r;});}return json({content:[],page:0,size:5,totalElements:0,totalPages:0});};
 let v=await mount();await act(async()=>btn(v.host,'Chọn hồ sơ khác').click());assert.equal(signal.aborted,true);await act(async()=>release(json([receipt])));assert.equal(v.host.textContent.includes(sid),false);assert.equal(new URLSearchParams(window.location.search).has('sessionId'),false);await v.close();
 globalThis.fetch=async(url,init)=>{if(init.method==='POST'){signal=init.signal;return new Promise(r=>{release=r;});}return json([]);};v=await mount();await act(async()=>btn(v.host,'Mở phiên bàn giao').click());await v.close();assert.equal(signal.aborted,true);await act(async()=>release(json(receipt,201)));
});
test('Query restoration verifies session against case and return link keeps both IDs',async()=>{
 const calls=[];globalThis.fetch=async(url)=>{calls.push(url);return json(url.endsWith(sid)?receipt:[receipt]);};
 const v=await mount({mode:'accounts'},'/staff/beneficiary-accounts?caseId='+cid+'&sessionId='+sid);assert.ok(calls.some(url=>url.endsWith('/'+sid)));const back=[...v.host.querySelectorAll('a')].find(a=>a.pathname==='/staff/handover');assert.equal(back.search,'?caseId='+cid+'&sessionId='+sid);await v.close();
});
test('Counter beneficiary list and email invitation actions render and trigger in accounts mode',async()=>{
 const calls=[];
 const testBen={beneficiaryId:'33333333-3333-4333-8333-333333333333',caseId:cid,fullName:'Nguyễn Văn A',relationship:'Con trai',identityVerificationStatus:'VERIFIED_AT_COUNTER',accountStatus:'PENDING',accountLinked:false,invitation:{state:'PENDING',expiresAt:'2026-10-25T00:00:00Z',generation:1},counterAttestation:{recorded:true,recordedAt:'2026-10-21T10:00:00Z',confirmedEmailRecorded:true},counterStep:'AWAITING_ACCOUNT_DECISION',actions:{canLinkAccount:true,canCreateAccount:true,canHandOverWithoutAccount:true,canRequestInvitationEmail:true}};
 globalThis.fetch=async(url,init)=>{
  calls.push({url,init});
  if(init?.method==='POST'&&url.includes('invitation-email')) return json({status:'QUEUED'},202);
  if(url.includes('/beneficiaries')) return json([testBen]);
  return json(url.endsWith(sid)?receipt:[receipt]);
 };
 const v=await mount({mode:'accounts'},'/staff/beneficiary-accounts?caseId='+cid+'&sessionId='+sid);
 assert.match(v.host.textContent,/Nguyễn Văn A/);
 assert.match(v.host.textContent,/Con trai/);
 const inviteBtn=btn(v.host,'Gửi email lời mời');
 assert.ok(inviteBtn);
 await act(async()=>inviteBtn.click());
 assert.ok(calls.some(c=>c.url.includes('/invitation-email')&&c.init.method==='POST'));
 await v.close();
});


test('Accounts mode links an existing account through the inline email form and reloads context', async () => {
  const id='33333333-3333-4333-8333-333333333333'; let linked=false, writes=0;
  globalThis.fetch=async(url,init)=>{
    if(init.method==='POST' && url.endsWith('/account-link')) {
      writes++; assert.deepEqual(JSON.parse(init.body),{accountEmail:'linh@example.test'});
      linked=true; return json({beneficiaryId:id,accountId:cid,accountStatus:'ACCOUNT_CREATED',identityVerificationStatus:'VERIFIED_AT_COUNTER'});
    }
    if(url.includes('/beneficiaries')) return json([{beneficiaryId:id,fullName:'Linh',accountLinked:linked,counterStep:linked?'ACCOUNT_LINKED':'AWAITING_ACCOUNT_DECISION',actions:{canLinkAccount:!linked}}]);
    return json(url.endsWith(sid)?receipt:[receipt]);
  };
  const v=await mount({mode:'accounts'},'/staff/beneficiary-accounts?caseId='+cid+'&sessionId='+sid);
  try {
    await act(async()=>btn(v.host,'Liên kết tài khoản').click());
    const input=v.host.querySelector('input[type="email"]'); assert.ok(input);
    await act(async()=>props(input).onChange({target:{value:'linh@example.test'}}));
    await act(async()=>props(input.closest('form')).onSubmit({preventDefault(){}}));
    assert.equal(writes,1); assert.match(v.host.textContent,/Đã liên kết tài khoản thành công/);
    assert.match(v.host.textContent,/Đã có tài khoản/); assert.equal(v.host.querySelector('input[type="email"]'),null);
  } finally { await v.close(); }
});

test('Counter writes reject duplicate clicks, abort on case switch and ignore late receipts', async () => {
  const ben = { beneficiaryId: '33333333-3333-4333-8333-333333333333', fullName: 'Old recipient', invitation: { generation: 1, state: 'PENDING' }, actions: { canRequestInvitationEmail: true } };
  let release, writeSignal, writes = 0;
  globalThis.fetch = async (url, init) => {
    if (init.method === 'POST') {
      writes++; writeSignal = init.signal;
      return new Promise(resolve => { release = resolve; });
    }
    if (url.includes('/beneficiaries')) return json([ben]);
    if (url.includes('/handover-sessions')) return json([]);
    return json({ content: [], page: 0, size: 5, totalElements: 0, totalPages: 0 });
  };
  const v = await mount({ mode: 'accounts' });
  try {
    const invite = btn(v.host, 'Gửi email lời mời');
    await act(async () => { invite.click(); invite.click(); });
    assert.equal(writes, 1);
    await act(async () => btn(v.host, 'Chọn hồ sơ khác').click());
    assert.equal(writeSignal.aborted, true);
    await act(async () => release(json({ status: 'QUEUED' }, 202)));
    assert.doesNotMatch(v.host.textContent, /Old recipient|Đã xếp hàng/);
  } finally { await v.close(); }
});
