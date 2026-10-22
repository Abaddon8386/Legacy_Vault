import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readInvitationMail, fetchInvitationMailStatus } from '../pages/staff/invitationMailService.js';
import { requestInvitationEmail } from '../pages/staff/liveHandoverService.js';

const id='11111111-1111-4111-8111-111111111111',bid='22222222-2222-4222-8222-222222222222';
const receipt={outboxId:id,invitationId:bid,invitationGeneration:2,queueStatus:'QUEUED',transportStatus:'ENABLED'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('mail receipt strictly whitelists public metadata and rejects malformed states or fabricated delivery',()=>{
  assert.deepEqual(readInvitationMail({...receipt,email:'private',code:'private'}),receipt);
  for(const value of [{},[],{...receipt,outboxId:'internal'},{...receipt,invitationGeneration:0},{...receipt,queueStatus:'DELIVERED'},{...receipt,transportStatus:'SMTP'}])assert.throws(()=>readInvitationMail(value),{code:'INVALID_RESPONSE'});
});
test('status GET uses assigned-case endpoint, auth, locale and abort signal; POST does not accept a fabricated queued body',async()=>{
  const signal=new AbortController().signal;
  const result=await fetchInvitationMailStatus(id,bid,{accessToken:'fixture',lang:'en',signal,fetchFn:async(url,options)=>{
    assert.equal(url,`/api/v1/staff/verification-cases/${id}/beneficiaries/${bid}/invitation-email`);
    assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer fixture');assert.equal(options.headers['Accept-Language'],'en');assert.equal(options.signal,signal);
    return json({...receipt,queueStatus:'ACCEPTED'});
  }});
  assert.equal(result.queueStatus,'ACCEPTED');
  await assert.rejects(requestInvitationEmail(id,bid,1,{fetchFn:async()=>json({status:'QUEUED'},202)}),{code:'INVALID_RESPONSE'});
  for(const generation of [-1,undefined,1.5])await assert.rejects(requestInvitationEmail(id,bid,generation),{code:'VALIDATION_FAILED'});
});

const dom=new JSDOM('<body></body>',{url:'http://localhost/staff/beneficiary-accounts'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const built=await build({configFile:false,plugins:[react()],logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/pages/staff/InvitationMailStatus.jsx',formats:['es']},rollupOptions:{external:['react','react-dom','react-dom/client','react/jsx-runtime']}}});
let code=(Array.isArray(built)?built[0]:built).output.find(item=>item.type==='chunk'&&item.isEntry).code;
for(const name of ['react','react-dom','react-dom/client','react/jsx-runtime'])code=code.replaceAll(`from "${name}"`,`from "${import.meta.resolve(name)}"`);
const Page=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const originalFetch=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=originalFetch;});
async function mount(props){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(React.createElement(Page,props)));return{host,render:async next=>act(async()=>root.render(React.createElement(Page,next))),close:async()=>{await act(async()=>root.unmount());host.remove();}};}
const base={caseId:id,beneficiaryId:bid,accessToken:'fixture-token',lang:'en'};
test('disabled transport is explicit; checking accepted status never claims inbox delivery or triggers a POST',async()=>{
  let calls=0;
  globalThis.fetch=async(_url,options)=>{calls++;assert.equal(options.method,'GET');return json({...receipt,queueStatus:'ACCEPTED'});};
  const view=await mount({...base,receipt:{...receipt,transportStatus:'DISABLED'}});
  try{assert.match(view.host.textContent,/delivery is disabled/);assert.equal(calls,0);
    await act(async()=>view.host.querySelector('button').click());
    assert.match(view.host.textContent,/provider accepted/);assert.match(view.host.textContent,/Inbox delivery is not confirmed/);assert.equal(calls,1);
    await view.render({...base,lang:'vi',receipt:{...receipt,transportStatus:'DISABLED'}});assert.match(view.host.textContent,/Chưa xác nhận đã vào hộp thư/);
  }finally{await view.close();}
});
test('error states remain truthful and raw provider details never enter the page',async()=>{
  for(const status of ['FAILED','UNKNOWN','SKIPPED']){
    const view=await mount({...base,receipt:{...receipt,queueStatus:status}});
    try{assert.ok(view.host.querySelector('[role=status]'));assert.doesNotMatch(view.host.textContent,/provider accepted/);}finally{await view.close();}
  }
  for(const httpStatus of [401,403,404,500]){
    let auth=0;globalThis.fetch=async()=>json({code:'INTERNAL_ERROR',message:'PRIVATE DETAILS'},httpStatus);
    const view=await mount({...base,receipt:{...receipt,queueStatus:'ACCEPTED'},onError:()=>auth++});
    try{await act(async()=>view.host.querySelector('button').click());assert.equal(view.host.querySelector('[role=status]'),null);assert.ok(view.host.querySelector('[role=alert]'));assert.doesNotMatch(view.host.textContent,/PRIVATE DETAILS/);assert.equal(auth,[401,403].includes(httpStatus)?1:0);}finally{await view.close();}
  }
});
test('duplicate status clicks are serialized; changing token clears old receipt and discards a late result',async()=>{
  let finish,signal,calls=0;
  globalThis.fetch=async(_url,options)=>{calls++;signal=options.signal;return new Promise(resolve=>{finish=resolve;});};
  const view=await mount({...base,receipt});
  try{await act(async()=>{view.host.querySelector('button').click();view.host.querySelector('button').click();});assert.equal(calls,1);
    await view.render({...base,accessToken:'new-token'});assert.equal(signal.aborted,true);assert.equal(view.host.querySelector('[role=status]'),null);
    await act(async()=>finish(json({...receipt,queueStatus:'ACCEPTED'})));assert.doesNotMatch(view.host.textContent,/provider accepted/);
  }finally{await view.close();}
});
