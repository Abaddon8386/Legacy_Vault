import test from 'node:test';import assert from 'node:assert/strict';import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {JSDOM} from 'jsdom';import {build} from 'vite';
import {readGroupView,saveGroupHandover} from '../services/groupHandoverService.js';
const a='11111111-1111-4111-8111-111111111111',s='22222222-2222-4222-8222-222222222222',r='33333333-3333-4333-8333-333333333333',q='44444444-4444-4444-8444-444444444444';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const view=(status='UNCONFIRMED',revision=0,allPresent=false)=>({state:{status,revision,allPresent,requestId:status==='AWAITING_LEGAL'?a:null,attendanceId:null,snapshot:status==='UNCONFIRMED'?null:'current'},snapshot:'current',requiredRecipientIds:[r,q],deliveryAllowed:status==='READY'&&allPresent});
test('group DTO rejects malformed or contradictory permission and duplicate required recipients',()=>{assert.throws(()=>readGroupView({...view(),deliveryAllowed:true}),{code:'INVALID_RESPONSE'});assert.throws(()=>readGroupView({...view(),requiredRecipientIds:[r,r]}),{code:'INVALID_RESPONSE'});assert.equal(readGroupView(view('READY',1,true)).deliveryAllowed,true);});
test('mutation sends declared actor-free body and idempotency key; rejects cross-session receipts',async()=>{let call;await assert.rejects(saveGroupHandover(a,s,'attendance',{expectedRevision:0,presentRecipientIds:[r],reason:'Missing one'},q,{accessToken:'test',fetchFn:async(url,init)=>{call={url,init};return json({caseId:a,sessionId:a,eventId:r,state:{revision:1}});}}),{code:'INVALID_RESPONSE'});assert.equal(call.init.headers['Idempotency-Key'],q);assert.deepEqual(JSON.parse(call.init.body),{expectedRevision:0,presentRecipientIds:[r],reason:'Missing one'});});
const dom=new JSDOM('<body></body>',{url:'http://localhost/staff/handover'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const built=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/components/staff/StaffGroupHandover.jsx',formats:['es']},rollupOptions:{external:['react','react/jsx-runtime']}}});let code=(Array.isArray(built)?built[0]:built).output.find(x=>x.type==='chunk'&&x.isEntry).code;for(const pkg of ['react','react/jsx-runtime'])code=code.replaceAll(`from "${pkg}"`,`from "${import.meta.resolve(pkg)}"`);const Panel=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const original=globalThis.fetch;test.afterEach(()=>{globalThis.fetch=original;});const props={caseId:a,sessionId:s,accessToken:'fixture',lang:'en',children:React.createElement('button',{'data-delivery':true},'Deliver')};
async function mount(extra={}){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(React.createElement(Panel,{...props,...extra})));return{host,render:async value=>act(async()=>root.render(React.createElement(Panel,{...props,...value}))),close:async()=>{await act(async()=>root.unmount());host.remove();}};}
const reactProps=el=>el[Object.keys(el).find(x=>x.startsWith('__reactProps$'))];const fill=async(host,text)=>act(async()=>reactProps(host.querySelector('textarea')).onChange({target:{value:text}}));const click=async(host,text)=>act(async()=>[...host.querySelectorAll('button')].find(e=>e.textContent===text).click());
test('missing one recipient suspends all; all present does not self-unlock; request waits for Legal and current approval restores delivery',async()=>{
 let current=view(),posts=[];globalThis.fetch=async(url,init={})=>{if(init.method==='POST'){const body=JSON.parse(init.body);posts.push(body);current=url.endsWith('/attendance')?view(body.presentRecipientIds.length===2&&current.state.status==='UNCONFIRMED'?'READY':'SUSPENDED',current.state.revision+1,body.presentRecipientIds.length===2):view('AWAITING_LEGAL',current.state.revision+1,true);return json({caseId:a,sessionId:s,eventId:q,state:current.state,notification:null});}return url.endsWith('/group-handover')?json(current):json([{beneficiaryId:r,fullName:'Recipient An'},{beneficiaryId:q,fullName:'Recipient Binh'}]);};
 const v=await mount();try{assert.equal(v.host.querySelector('[data-delivery]'),null);await act(async()=>v.host.querySelector('input').click());await fill(v.host,'Binh is absent');await click(v.host,'Record absence and suspend all delivery');assert.match(v.host.textContent,/whole handover is suspended/);assert.deepEqual(posts[0].presentRecipientIds,[r]);assert.equal(v.host.querySelector('[data-delivery]'),null);
 assert.equal(v.host.querySelectorAll('input:checked').length,1);
 await act(async()=>v.host.querySelectorAll('input:not(:checked)').forEach(input=>input.click()));await fill(v.host,'Both attended now');await click(v.host,'Record everyone present');assert.equal(v.host.querySelectorAll('input:checked').length,2);assert.match(v.host.textContent,/Everyone present — request reopening/);assert.equal(v.host.querySelector('[data-delivery]'),null);await fill(v.host,'Please review current attendance');await click(v.host,'Request Legal reopening');assert.match(v.host.textContent,/awaiting Legal/i);assert.equal(v.host.querySelectorAll('input:checked').length,2);assert.equal(v.host.querySelector('textarea'),null);assert.equal(v.host.querySelector('[data-delivery]'),null);
 current=view('READY',4,true);await click(v.host,'Reload attendance');assert.ok(v.host.querySelector('[data-delivery]'));assert.ok(!v.host.textContent.includes(r));}finally{await v.close();}
});

test('saved server attendance survives reopening the page; waiting and unsent reopening have distinct Vietnamese labels',async()=>{
 let current={...view('SUSPENDED',2,true),attendance:{presentRecipientIds:[r,q]}},posts=0;
 globalThis.fetch=async (url,init={})=>{if(init.method==='POST')posts++;return url.endsWith('/group-handover')?json(current):json([{beneficiaryId:r,fullName:'An'},{beneficiaryId:q,fullName:'Bình'}]);};
 const v=await mount({lang:'vi'});
 try{
  assert.match(v.host.querySelector('h2').textContent,/Đã đủ người — cần gửi yêu cầu mở lại/);
  assert.equal(v.host.querySelectorAll('input:checked').length,2);
  await act(async()=>v.host.querySelectorAll('input')[1].click());await fill(v.host,'Một người vừa rời quầy');
  const reopen=[...v.host.querySelectorAll('button')].find(x=>x.textContent==='Gửi yêu cầu mở lại');
  assert.equal(reopen.disabled,true);await act(async()=>reactProps(reopen).onClick());assert.equal(posts,0);
  await act(async()=>v.host.querySelectorAll('input')[1].click());
  current={...view('AWAITING_LEGAL',3,true),attendance:{presentRecipientIds:[r,q]}};
  await click(v.host,'Tải lại danh sách có mặt');
  assert.match(v.host.querySelector('h2').textContent,/Đã đủ người — đang chờ Ban Pháp lý cho mở lại/);
  assert.equal(v.host.querySelectorAll('input:checked').length,2);
  assert.ok(v.host.querySelector('fieldset').disabled);
  await click(v.host,'Thay đổi tình hình có mặt');
  await act(async()=>v.host.querySelectorAll('input')[1].click());
  assert.equal(v.host.querySelectorAll('input:checked').length,1);
  await click(v.host,'Hủy chỉnh sửa có mặt');
  assert.equal(v.host.querySelectorAll('input:checked').length,2);
  assert.equal(v.host.querySelector('[data-delivery]'),null);
 }finally{await v.close();}
});

test('Staff sees the latest Legal reopening decision with its reason, and a refusal explains the next step',async()=>{
 const people=[{beneficiaryId:r,fullName:'An'},{beneficiaryId:q,fullName:'Bình'}];
 const decided=(result,reason)=>({...view('SUSPENDED',3,true),attendance:{presentRecipientIds:[r,q]},lastDecision:{eventId:a,result,decidedAt:'2026-11-08T17:56:00Z',decidedBy:{userId:a,fullName:'Linh Legal'},reason}});
 let current=decided('REJECT','Người nhận chưa đúng');
 globalThis.fetch=async (url)=>url.endsWith('/group-handover')?json(current):json(people);
 const v=await mount({lang:'vi'});
 try{
  const card=v.host.querySelector('.lv-group-handover__decision.is-rejected');assert.ok(card,'a refusal is visible to Staff');
  assert.match(card.textContent,/Quyết định gần nhất của Ban Pháp lý: Từ chối mở lại/);assert.match(card.textContent,/Linh Legal/);assert.match(card.textContent,/Người nhận chưa đúng/);
  assert.match(card.textContent,/gửi yêu cầu mới/,'a refusal tells Staff what to do next');
  assert.match(card.textContent,/00:56/,'time is shown in Vietnam time (UTC+7)');assert.match(card.textContent,/09\/11\/2026/);
  current=decided('APPROVE','Đủ người, cho tiếp tục');await v.render({lang:'vi'});
  await act(async()=>{window.dispatchEvent(new window.Event('focus'));});
  assert.ok(v.host.querySelector('.lv-group-handover__decision.is-approved'),'an approval is visible too');
 }finally{await v.close();}
});
test('a new session snapshot never inherits the previous attendance selections',async()=>{
 globalThis.fetch=async url=>url.endsWith('/group-handover')?json({...view('SUSPENDED',2,true),snapshot:'new-session-snapshot',attendance:{presentRecipientIds:[r,q]}}):json([{beneficiaryId:r,fullName:'An'},{beneficiaryId:q,fullName:'Bình'}]);
 const v=await mount();try{assert.equal(v.host.querySelectorAll('input:checked').length,0);assert.equal(v.host.querySelector('[data-delivery]'),null);}finally{await v.close();}
});

test('a changed approval snapshot clears old attendance even when the group revision is unchanged',async()=>{
 let current={...view('SUSPENDED',2,true),attendance:{presentRecipientIds:[r,q]}};
 globalThis.fetch=async url=>url.endsWith('/group-handover')?json(current):json([{beneficiaryId:r,fullName:'An'},{beneficiaryId:q,fullName:'Binh'}]);
 const v=await mount();try{assert.equal(v.host.querySelectorAll('input:checked').length,2);current={...current,snapshot:'updated-approval'};await click(v.host,'Reload attendance');assert.equal(v.host.querySelectorAll('input:checked').length,0);assert.equal(v.host.querySelector('[data-delivery]'),null);}finally{await v.close();}
});
test('scope change aborts previous read and never renders its late permission; unavailable API cannot enable delivery',async()=>{let finish,signal;globalThis.fetch=async(url,init)=>{if(url.endsWith('/group-handover')){signal=init.signal;return new Promise(resolve=>{finish=resolve;});}return json([]);};const v=await mount();try{globalThis.fetch=async()=>json({code:'RESOURCE_NOT_FOUND'},404);await v.render({caseId:q});assert.equal(signal.aborted,true);await act(async()=>finish(json(view('READY',1,true))));assert.equal(v.host.querySelector('[data-delivery]'),null);assert.ok(v.host.querySelector('[role=alert]'));}finally{await v.close();}});
test('editing a READY attendance record hides delivery until the changed attendance is recorded',async()=>{
 let current=view('READY',1,true);globalThis.fetch=async(url,init={})=>{if(init.method==='POST'){current=view('SUSPENDED',2,false);return json({caseId:a,sessionId:s,eventId:q,state:current.state});}return url.endsWith('/group-handover')?json(current):json([{beneficiaryId:r,fullName:'Recipient An'},{beneficiaryId:q,fullName:'Recipient Binh'}]);};const v=await mount();try{assert.ok(v.host.querySelector('[data-delivery]'));assert.equal(v.host.querySelector('textarea'),null);await click(v.host,'Update who is present');assert.equal(v.host.querySelector('[data-delivery]'),null);await act(async()=>v.host.querySelector('input').click());await fill(v.host,'One recipient left');await click(v.host,'Record absence and suspend all delivery');assert.match(v.host.textContent,/whole handover is suspended/);assert.equal(v.host.querySelector('[data-delivery]'),null);}finally{await v.close();}
});

test('the asset screen skips the attendance block once delivery is allowed, and still shows it when blocked',async()=>{
 let current=view('READY',1,true);globalThis.fetch=async url=>url.endsWith('/group-handover')?json(current):json([{beneficiaryId:r,fullName:'An'},{beneficiaryId:q,fullName:'Binh'}]);
 const allowed=await mount({hideWhenAllowed:true});
 try{assert.ok(allowed.host.querySelector('[data-delivery]'));assert.equal(allowed.host.querySelector('.lv-group-handover'),null);}finally{await allowed.close();}
 current=view('SUSPENDED',2,false);
 const blocked=await mount({hideWhenAllowed:true});
 try{assert.equal(blocked.host.querySelector('[data-delivery]'),null);assert.ok(blocked.host.querySelector('.lv-group-handover'));}finally{await blocked.close();}
});

test('layout places other content between the attendance block and delivery',async()=>{
 globalThis.fetch=async url=>url.endsWith('/group-handover')?json(view('READY',1,true)):json([{beneficiaryId:r,fullName:'An'},{beneficiaryId:q,fullName:'Binh'}]);
 const v=await mount({layout:(attendance,delivery)=>React.createElement(React.Fragment,null,attendance,React.createElement('aside',{'data-check':true}),delivery)});
 try{
  const order=[...v.host.children].map(item=>item.tagName);
  assert.deepEqual(order,['SECTION','ASIDE','BUTTON']);
 }finally{await v.close();}
});
