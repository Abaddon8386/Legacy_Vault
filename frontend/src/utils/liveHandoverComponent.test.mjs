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
