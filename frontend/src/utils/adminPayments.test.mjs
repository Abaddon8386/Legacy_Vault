import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fetchAdminPayments,fetchAdminPayment,readAdminPayment} from './adminPaymentService.js';
import {lookupAdminAccount} from './adminSubscriptionService.js';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {build} from 'vite';
const fixture=JSON.parse(readFileSync('../docs/api-contracts/fixtures/admin-payments.json','utf8'));
const item=fixture.content[0];
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

test('PS-115 adapter maps filters/pagination, preserves historical amount and strips sensitive fields',async()=>{
  let call;
  const data=await fetchAdminPayments({query:' synthetic@example.test ',status:'SUCCEEDED',from:'2026-10-20T00:00:00Z',page:0,size:20},{accessToken:'test',fetchFn:async(url,init)=>{call={url,init};return json({...fixture,content:[{...item,amountVnd:123000,secret:'never',limits:{...item.limits,key:'never'}}]});}});
  const q=new URL(call.url,'http://localhost').searchParams;
  assert.equal(q.get('query'),'synthetic@example.test');assert.equal(q.get('page'),'0');assert.equal(q.get('size'),'20');
  assert.equal(q.get('status'),'SUCCEEDED');assert.equal(call.init.headers.Authorization,'Bearer test');
  assert.equal(data.content[0].amountVnd,123000);assert.equal(data.content[0].secret,undefined);assert.equal(data.content[0].limits.key,undefined);
});
test('Invalid query/date/page fails before network; invalid pages/receipts never become empty success',async()=>{
  let calls=0;
  for(const filters of [{page:-1},{size:101},{status:'CANCELLED'},{from:'bad'},{from:'2026-10-22T00:00:00Z',to:'2026-10-21T00:00:00Z'},{query:'x\n'}])
    await assert.rejects(fetchAdminPayments(filters,{fetchFn:()=>{calls++;}}),{code:'VALIDATION_FAILED'});
  assert.equal(calls,0);
  for(const patch of [{content:null},{page:1},{totalElements:2},{content:[item,item]}])
    await assert.rejects(fetchAdminPayments({}, {fetchFn:async()=>json({...fixture,...patch})}),{code:'INVALID_RESPONSE'});
  for(const patch of [{amountVnd:'499000'},{status:'EXPIRED',persistedStatus:'FAILED'},{limits:null},{paymentId:'internal-1'}]) assert.throws(()=>readAdminPayment({...item,...patch}),{code:'INVALID_RESPONSE'});
});
test('Detail rejects mismatched id; HTTP errors and abort retain meaning; malformed quota is not fabricated',async()=>{
  await assert.rejects(fetchAdminPayment('30000000-0000-4000-8000-000000000001',{fetchFn:async()=>json(item)}),{code:'INVALID_RESPONSE'});
  for(const status of [401,403,404,409]) await assert.rejects(fetchAdminPayments({}, {fetchFn:async()=>json({code:status===409?'PAYMENT_TRANSACTION_SOURCE_UNAVAILABLE':'DENIED'},status)}),{status});
  await assert.rejects(fetchAdminPayments({}, {fetchFn:async()=>{throw new DOMException('abort','AbortError');}}),{name:'AbortError'});
  await assert.rejects(lookupAdminAccount('x',{fetchFn:async()=>json({assetCount:1})}),{code:'INVALID_RESPONSE'});
});

const dom=new JSDOM('<body></body>',{url:'http://localhost/admin/subscriptions'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const built=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/pages/admin/AdminPaymentTransactions.jsx',formats:['es']},rollupOptions:{external:['react','react/jsx-runtime']}}});
let code=(Array.isArray(built)?built[0]:built).output.find(x=>x.type==='chunk'&&x.isEntry).code;
for(const name of ['react','react/jsx-runtime'])code=code.replaceAll('from "'+name+'"','from "'+import.meta.resolve(name)+'"');
const Panel=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const button=(host,text)=>[...host.querySelectorAll('button')].find(x=>x.textContent===text);
const props=el=>el[Object.keys(el).find(k=>k.startsWith('__reactProps$'))];
async function mount(){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(React.createElement(Panel,{accessToken:'test',lang:'en'})));return{host,root,close:async()=>{await act(async()=>root.unmount());host.remove();}};}
test('UI opens exact detail, filters with page reset, and distinguishes empty from unavailable',async()=>{
  const prior=globalThis.fetch;const calls=[];
  globalThis.fetch=async(url)=>{calls.push(url);return json(url.includes('/transactions/')?item:fixture);};
  const v=await mount();
  try{
    assert.match(v.host.textContent,/499,000 VND/);
    await act(async()=>button(v.host,'View').click());assert.ok(v.host.querySelector('[role=dialog]'));assert.match(v.host.textContent,/lifetime/);
    globalThis.fetch=async(url)=>{calls.push(url);return json({content:[],page:0,size:20,totalElements:0,totalPages:0});};
    await act(async()=>props(v.host.querySelector('input')).onChange({target:{value:'none@example.test'}}));
    await act(async()=>props(v.host.querySelector('form')).onSubmit({preventDefault(){}}));
    assert.equal(v.host.querySelector('[role=dialog]'),null);assert.match(v.host.textContent,/No matching transactions/);assert.match(calls.at(-1),/query=none%40example.test/);
    globalThis.fetch=async()=>json({code:'PAYMENT_TRANSACTION_SOURCE_UNAVAILABLE'},409);
    await act(async()=>button(v.host,'Reload').click());assert.ok(v.host.querySelector('[role=alert]'));assert.doesNotMatch(v.host.textContent,/No matching transactions/);
  }finally{await v.close();globalThis.fetch=prior;}
});
test('Account switch aborts detail, clears old results and ignores late success',async()=>{
  const prior=globalThis.fetch;let release,signal;
  globalThis.fetch=async(url,init)=>{if(url.includes('/transactions/')){signal=init.signal;return new Promise(r=>{release=r;});}return json(fixture);};
  const v=await mount();
  try{
    await act(async()=>button(v.host,'View').click());
    globalThis.fetch=async()=>json({code:'ACCESS_DENIED'},403);
    await act(async()=>v.root.render(React.createElement(Panel,{accessToken:'other',lang:'en'})));
    assert.equal(signal.aborted,true);await act(async()=>release(json(item)));
    assert.equal(v.host.querySelector('[role=dialog]'),null);assert.doesNotMatch(v.host.textContent,/synthetic@example.test/);assert.ok(v.host.querySelector('[role=alert]'));
  }finally{await v.close();globalThis.fetch=prior;}
});

test('Next page fetches server page, hides old rows while pending and closes old detail',async()=>{
  const prior=globalThis.fetch;let release,lastUrl;
  const first=Array.from({length:20},(_,i)=>{const paymentId=`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;return {...item,paymentId,checkoutReference:paymentId.replaceAll('-','')};});
  globalThis.fetch=async(url)=>{
    lastUrl=url;
    if(url.includes('/transactions/')) return json(item);
    if(new URL(url,'http://local').searchParams.get('page')==='1') return new Promise(r=>{release=r;});
    return json({...fixture,content:first,totalElements:21,totalPages:2});
  };
  const v=await mount();
  try{
    await act(async()=>button(v.host,'Next').click());
    assert.match(lastUrl,/page=1/);assert.doesNotMatch(v.host.textContent,/synthetic@example.test/);
    await act(async()=>release(json({...fixture,page:1,totalElements:21,totalPages:2})));
    assert.match(v.host.textContent,/2 \/ 2/);assert.equal(button(v.host,'Next').disabled,true);
  }finally{await v.close();globalThis.fetch=prior;}
});

test('Detail 403 removes private list and dialog instead of retaining stale results',async()=>{
  const prior=globalThis.fetch;
  globalThis.fetch=async(url)=>url.includes('/transactions/')?json({code:'ACCESS_DENIED'},403):json(fixture);
  const v=await mount();
  try{await act(async()=>button(v.host,'View').click());assert.equal(v.host.querySelector('[role=dialog]'),null);assert.doesNotMatch(v.host.textContent,/synthetic@example.test/);assert.ok(v.host.querySelector('[role=alert]'));}
  finally{await v.close();globalThis.fetch=prior;}
});
