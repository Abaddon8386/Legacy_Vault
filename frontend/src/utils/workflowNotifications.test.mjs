import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {build} from 'vite';
const dom=new JSDOM('<body></body>',{url:'http://localhost/',pretendToBeVisual:true});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const built=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/components/common/WorkflowNotifications.jsx',formats:['es']},rollupOptions:{external:['react','react/jsx-runtime']}}});
let code=(Array.isArray(built)?built[0]:built).output.find(x=>x.type==='chunk'&&x.isEntry).code;
for(const name of ['react','react/jsx-runtime'])code=code.replaceAll('from "'+name+'"','from "'+import.meta.resolve(name)+'"');
const Component=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const id='11111111-1111-4111-8111-111111111111',caseId='22222222-2222-4222-8222-222222222222';
const item={id,caseId,caseNumber:'HS-2026-000001',action:'LEGAL_BASIS_REVIEW_REQUIRED',reason:'Bổ sung trang cuối của văn bản',occurredAt:'2026-10-28T01:00:00Z',read:false};
const json=x=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}});
async function mount(props={session:{accessToken:'test-only'},role:'STAFF',lang:'vi'}){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const render=async props=>act(async()=>root.render(React.createElement(Component,props)));await render(props);const expand=async()=>act(async()=>{host.querySelector('details').open=true;host.querySelector('details').dispatchEvent(new window.Event('toggle',{bubbles:true}));});return{host,render,expand,close:async()=>{await act(async()=>root.unmount());host.remove();}};}
const originalFetch=globalThis.fetch;test.afterEach(()=>{globalThis.fetch=originalFetch;});

test('Staff deep links preserve exact case, language and allocation step without business POSTs',async()=>{
 for(const [action,path] of [['LEGAL_DEATH_DOCUMENT_DECIDED','/staff/cases'],['WILL_COMPARISON_RECORDED','/staff/cases'],['DISTRIBUTION_DOCUMENT_SUPPLEMENTATION_REQUESTED','/staff/legal-documents'],['LEGAL_BASIS_DECIDED','/staff/legal-documents'],['DISTRIBUTION_ALLOCATIONS_APPROVED','/staff/legal-documents']]){
  const destinations=[],methods=[];globalThis.fetch=async(_url,init)=>{methods.push(init.method||'GET');return init.method==='PUT'?json({id,read:true}):json([{...item,action,reason:'Scoped Legal feedback'}]);};
  const v=await mount({session:{accessToken:'staff-token'},role:'STAFF',lang:'en',onNavigate:url=>destinations.push(url)});
  try{await v.expand();assert.match(v.host.textContent,/Scoped Legal feedback/);await act(async()=>v.host.querySelector('li button').click());assert.ok(destinations[0].startsWith(path+'?caseId='+caseId));assert.match(destinations[0],/lang=en/);assert.equal(destinations[0].includes('tab=allocations'),action==='DISTRIBUTION_ALLOCATIONS_APPROVED');assert.deepEqual(methods,['GET','PUT']);}finally{await v.close();}
 }
});
test('failed mark-read cannot navigate or claim local read success',async()=>{
 const destinations=[];globalThis.fetch=async(_url,init)=>init.method==='PUT'?new Response(JSON.stringify({code:'ACCESS_DENIED'}),{status:403,headers:{'Content-Type':'application/json'}}):json([item]);const v=await mount({session:{accessToken:'staff-token'},role:'STAFF',lang:'vi',onNavigate:url=>destinations.push(url)});
 try{await v.expand();await act(async()=>v.host.querySelector('li button').click());assert.deepEqual(destinations,[]);assert.match(v.host.textContent,/Chưa tải được/);}finally{await v.close();}
});
test('shows real unread notice and supplementation reason; acknowledges then opens exactly its case',async()=>{
 const calls=[],destinations=[];globalThis.fetch=async(url,init)=>{calls.push({url,init});return init.method==='PUT'?json({id,read:true}):json([item]);};
 const view=await mount({session:{accessToken:'staff-token'},role:'STAFF',lang:'vi',onNavigate:url=>destinations.push(url)});
 try{await view.expand();assert.match(view.host.textContent,/Bổ sung trang cuối/);assert.ok(view.host.querySelector('.lv-workflow-notifications__dot'));await act(async()=>view.host.querySelector('li button').click());assert.ok(calls[1].url.includes(id+'/read?workspace=STAFF'));assert.equal(calls[1].init.headers.Authorization,'Bearer staff-token');assert.deepEqual(destinations,['/staff/legal-documents?caseId='+caseId+'&lang=vi']);}finally{await view.close();}
});
test('token change aborts the old request and prevents a late response from restoring its private notices',async()=>{
 let finish,signal;globalThis.fetch=async(_url,init)=>init.headers.Authorization==='Bearer first'?new Promise(resolve=>{finish=resolve;signal=init.signal;}):json([]);
 const view=await mount({session:{accessToken:'first'},role:'LEGAL'});
 try{await view.expand();await view.render({session:{accessToken:'second'},role:'LEGAL'});assert.equal(signal.aborted,true);await act(async()=>finish(json([item])));assert.doesNotMatch(view.host.textContent,/HS-2026-000001/);assert.match(view.host.textContent,/Chưa có thông báo/);}finally{await view.close();}
});
test('server errors are reported as unavailable and never shown as an empty success',async()=>{
 globalThis.fetch=async()=>new Response('{}',{status:403,headers:{'Content-Type':'application/json'}});const view=await mount();
 try{await view.expand();assert.match(view.host.textContent,/Chưa tải được thông báo/);assert.doesNotMatch(view.host.textContent,/Chưa có thông báo/);}finally{await view.close();}
});
test('unmount cancels requests and malformed rows never become clickable notifications',async()=>{
 let signal;globalThis.fetch=async(_url,init)=>{signal=init.signal;return new Promise(()=>{});};const pending=await mount();await pending.close();assert.equal(signal.aborted,true);
 globalThis.fetch=async()=>json([{...item,caseId:'not-a-case'}]);const view=await mount();try{await view.expand();assert.equal(view.host.querySelector('li button'),null);assert.match(view.host.textContent,/Chưa tải được/);}finally{await view.close();}
});

test('an unimplemented notification API is shown as unavailable and never as an empty inbox', async () => {
 globalThis.fetch=async()=>new Response('{}',{status:404,headers:{'Content-Type':'application/json'}});
 const view=await mount();
 try{await view.expand();assert.match(view.host.textContent,/Thông báo hiện chưa khả dụng/);assert.doesNotMatch(view.host.textContent,/Chưa có thông báo/);assert.equal(view.host.querySelector('li button'),null);}finally{await view.close();}
});

test('document acceptance and allocation corrections open the Staff allocation tab for the exact case', async () => {
  const destinations = [];
  globalThis.fetch = async (_url, init) => init.method === 'PUT' ? json({ id, read: true }) : json([{ ...item, action: 'DISTRIBUTION_ALLOCATION_CHANGES_REQUESTED' }]);
  const view = await mount({ session: { accessToken: 'staff-token' }, role: 'STAFF', lang: 'vi', onNavigate: url => destinations.push(url) });
  try { await view.expand(); await act(async () => view.host.querySelector('li button').click()); assert.deepEqual(destinations, ['/staff/legal-documents?caseId=' + caseId + '&lang=vi&tab=allocations']); }
  finally { await view.close(); }
});
