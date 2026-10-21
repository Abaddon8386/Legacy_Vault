import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {build} from 'vite';
const dom=new JSDOM('<body></body>',{url:'http://localhost/staff/cases'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const built=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/pages/staff/StaffLiveCase.jsx',formats:['es']},rollupOptions:{external:['react','react/jsx-runtime']}}});
let code=(Array.isArray(built)?built[0]:built).output.find(x=>x.type==='chunk'&&x.isEntry).code;
for(const name of ['react','react/jsx-runtime'])code=code.replaceAll('from "'+name+'"','from "'+import.meta.resolve(name)+'"');
const {default:Screen}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const id='12345678-1234-4234-8234-123456789012', detail={caseId:id,status:'OPEN',caseNumber:'HS-2026-000123'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const props=e=>e[Object.keys(e).find(k=>k.startsWith('__reactProps$'))];
const button=(host,text)=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes(text));
async function mount(){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const options={caseId:id,accessToken:'synthetic',lang:'vi',onBack(){}};await act(async()=>root.render(React.createElement(Screen,options)));return{host,root,options,close:async()=>{await act(async()=>root.unmount());host.remove();}};}
test('Auto-loads documents, retains VI/EN draft, saves intake and displays server receipt',async()=>{
 let release,writes=0;globalThis.fetch=async(url,init)=>{if(init.method==='POST'){writes++;return new Promise(r=>{release=r;});}return json(url.endsWith('death-documents')?[]:detail);};
 const v=await mount();
 assert.ok(button(v.host,'Làm mới danh sách giấy tờ'));
 assert.equal(v.host.querySelector('fieldset').disabled,false);
 await act(async()=>props(v.host.querySelector('fieldset input')).onChange({target:{value:'Draft authority'}}));
 await act(async()=>v.root.render(React.createElement(Screen,{...v.options,lang:'en'})));assert.equal(v.host.querySelector('fieldset input').value,'Draft authority');
 assert.ok(button(v.host,'Refresh document list'));
 const submit=()=>props(v.host.querySelector('form')).onSubmit({preventDefault(){}});
 await act(async()=>submit());await act(async()=>submit());assert.equal(writes,1);assert.ok(v.host.querySelector('progress'));
 await act(async()=>release(json({id,caseId:id,receivedBy:id,receivedAt:'2026-10-20T05:00:00Z'},201)));
 assert.equal(v.host.querySelector('progress'),null);assert.match(v.host.textContent,/Saved by server/);await v.close();
});
test('Error keeps draft; unmount aborts pending writes; refresh button retries document list',async()=>{
 let signal,release;globalThis.fetch=async(url,init)=>init.method==='POST'?json({code:'CASE_CONFLICT'},409):json(url.endsWith('death-documents')?[]:detail);
 const v=await mount();
 assert.equal(v.host.querySelector('fieldset').disabled,false);
 await act(async()=>button(v.host,'Làm mới danh sách giấy tờ').click());
 await act(async()=>props(v.host.querySelector('fieldset input')).onChange({target:{value:'Keep'}}));
 await act(async()=>props(v.host.querySelector('form')).onSubmit({preventDefault(){}}));assert.equal(v.host.querySelector('fieldset input').value,'Keep');assert.match(v.host.textContent,/CASE_CONFLICT/);
 globalThis.fetch=async(url,init)=>{signal=init.signal;return new Promise(r=>{release=r;});};await act(async()=>button(v.host,'Nhận hồ sơ').click());await v.close();assert.equal(signal.aborted,true);await act(async()=>release(json(detail)));
});
