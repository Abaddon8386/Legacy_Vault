import test from 'node:test';
import assert from 'node:assert/strict';
import {readEmailCredential,loadEmailVerification,sendEmailVerification,confirmEmailVerification} from '../services/emailVerificationService.js';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {build} from 'vite';
const token='A'.repeat(43),json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('status and queued receipts are validated; verified state is never inferred from sending',async()=>{
  assert.equal(readEmailCredential('#token='+token),token);assert.equal(readEmailCredential('#token='+token+'&token='+token),null);
  await assert.rejects(loadEmailVerification({fetchFn:async()=>json({verified:true})}),{code:'INVALID_RESPONSE'});
  const calls=[];const receipt=await sendEmailVerification({accessToken:'fixture',lang:'en',fetchFn:async(url,init)=>{calls.push({url,init});return json({status:'QUEUED'},202);}});
  assert.deepEqual(receipt,{status:'QUEUED'});assert.deepEqual(JSON.parse(calls[0].init.body),{locale:'en'});
  assert.equal(calls[0].url,'/api/v1/auth/email-verification/requests');
});
test('confirm is public, requires 204, sends credential only in body and rejects expiry and replay',async()=>{
  let call;await confirmEmailVerification(token,{fetchFn:async(url,init)=>{call={url,init};return new Response(null,{status:204});}});
  assert.ok(!call.url.includes(token));assert.equal(call.init.headers.Authorization,undefined);assert.equal(call.init.referrerPolicy,'no-referrer');assert.deepEqual(JSON.parse(call.init.body),{credential:token});
  await assert.rejects(confirmEmailVerification(token,{fetchFn:async()=>json({code:'EMAIL_VERIFICATION_INVALID'},400)}),{code:'EMAIL_VERIFICATION_INVALID'});
  await assert.rejects(confirmEmailVerification(token,{fetchFn:async()=>json({},200)}),{code:'EMAIL_VERIFICATION_INVALID'});
});
const dom=new JSDOM('<body></body>',{url:'http://localhost/verify-email#token='+token});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const built=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/pages/auth/EmailVerification.jsx',formats:['es']},rollupOptions:{external:['react','react/jsx-runtime']}}});
let code=(Array.isArray(built)?built[0]:built).output.find(x=>x.type==='chunk'&&x.isEntry).code;for(const pkg of ['react','react/jsx-runtime'])code=code.replaceAll(`from "${pkg}"`,`from "${import.meta.resolve(pkg)}"`);
const {default:Page,EmailVerificationPanel:Panel}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const original=globalThis.fetch;test.afterEach(()=>{globalThis.fetch=original;});
async function mount(component,props){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(React.createElement(component,props)));return{host,render:async p=>act(async()=>root.render(React.createElement(component,p))),close:async()=>{await act(async()=>root.unmount());host.remove();}};}
test('link is scrubbed before confirm, double clicks send once and success does not redeem or grant a session',async()=>{
  window.history.replaceState({},'','/verify-email#token='+token);let writes=0,finish;
  globalThis.fetch=async(url,init)=>{writes++;assert.ok(url.endsWith('/confirm'));assert.equal(window.location.hash,'');assert.equal(JSON.parse(init.body).credential,token);return new Promise(resolve=>{finish=resolve;});};
  const v=await mount(Page,{lang:'en'});try{assert.equal(window.location.hash,'');const button=v.host.querySelector('button');await act(async()=>{button.click();button.click();});assert.equal(writes,1);await act(async()=>finish(new Response(null,{status:204})));assert.match(v.host.textContent,/has been verified/);assert.equal(window.sessionStorage.length,0);}finally{await v.close();}
});
test('account or email switch aborts and rejects stale verification status; missing provider remains honest',async()=>{
  let finish,signal;globalThis.fetch=async(url,init)=>{signal=init.signal;return new Promise(resolve=>{finish=resolve;});};
  const session={accessToken:'first',user:{id:'one',email:'first@example.test'}};const v=await mount(Panel,{session,lang:'en'});
  try{globalThis.fetch=async()=>json({verified:false,verifiedAt:null,requestAvailable:false,lastRequestState:null,lastRequestedAt:null});await v.render({session:{accessToken:'second',user:{id:'two',email:'second@example.test'}},lang:'en'});assert.equal(signal.aborted,true);await act(async()=>finish(json({verified:true,verifiedAt:'2026-10-31T01:00:00',requestAvailable:false,lastRequestState:null})));assert.match(v.host.textContent,/Email not verified/);assert.doesNotMatch(v.host.textContent,/first@example/);assert.equal([...v.host.querySelectorAll('button')].at(-1).disabled,true);}finally{await v.close();}
});
