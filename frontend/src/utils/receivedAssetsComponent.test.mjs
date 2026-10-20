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


const {default:Received}=await loadComponentModule('src/pages/beneficiary/ReceivedAssets.jsx');
const subject='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='11111111-1111-4111-8111-111111111111',imageId='22222222-2222-4222-8222-222222222222';
const item={itemId:id,title:'Synthetic received item',sourceLabel:'Synthetic source',deliveryStatus:'DELIVERED',deliveredAt:'2026-10-20T08:00:00Z',sessionStatus:'COMPLETED',vaultStatus:'ARCHIVED',caseStatus:'CLOSED'};
function adapter(extra={}){return {list:async({page,size})=>({subjectId:subject,page,size,total:1,accountState:'RECEIVED',items:[item]}),detail:async()=>({...item,subjectId:subject,images:[{imageId,label:'Synthetic photo'}]}),content:async()=>({subjectId:subject,itemId:id,text:'Synthetic secret <script>not HTML</script>'}),image:async()=>new Blob(['synthetic'],{type:'image/png'}),...extra};}
const button=(host,text)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
async function mount(extra={}){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const options={actions:adapter(),userId:subject,accessToken:'synthetic',lang:'vi',...extra};await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Received,options))));return{host,root,options,render:async overrides=>{Object.assign(options,overrides);await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Received,options))));},close:async()=>{await act(async()=>root.unmount());host.remove();}};}
async function open(v){await act(async()=>{const b=button(v.host,'Xem tài sản đã nhận');b.focus();b.click();});return document.querySelector('[role=dialog]');}
test('No adapter is honest pending, not an empty list or Owner API fallback',async()=>{
 let calls=0;const old=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw new Error('No calls allowed');};const v=await mount({actions:undefined});assert.match(v.host.textContent,/chưa khả dụng/);assert.doesNotMatch(v.host.textContent,/Chưa có tài sản được bàn giao/);assert.equal(calls,0);await v.close();globalThis.fetch=old;
});
test('Archived delivered item, escaped content, VI/EN detail persistence and Escape cleanup',async()=>{
 const v=await mount();assert.match(v.host.textContent,/Đã lưu trữ — vẫn được xem/);let dialog=await open(v);await act(async()=>button(dialog,'Xem nội dung đã nhận').click());assert.match(dialog.textContent,/Synthetic secret/);assert.equal(dialog.querySelector('script'),null);
 await v.render({lang:'en'});dialog=document.querySelector('[role=dialog]');assert.match(dialog.textContent,/Synthetic secret/);assert.match(dialog.textContent,/completed or archived/);
 await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.querySelector('[role=dialog]'),null);assert.equal(document.body.textContent.includes('Synthetic secret'),false);assert.ok(document.activeElement===button(v.host,'View received asset'),'focus should return to trigger');await v.close();
});
test('Image blob URLs are revoked when hidden/closed and pending images abort on unmount',async()=>{
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;const revoked=[];URL.createObjectURL=()=> 'blob:synthetic';URL.revokeObjectURL=url=>revoked.push(url);
 try{const v=await mount();let dialog=await open(v);await act(async()=>button(dialog,'Xem ảnh').click());assert.equal(dialog.querySelector('img').getAttribute('src'),'blob:synthetic');await act(async()=>button(dialog,'Ẩn ảnh').click());assert.deepEqual(revoked,['blob:synthetic']);await act(async()=>button(dialog,'Xem ảnh').click());await act(async()=>button(dialog,'Đóng tài sản đã nhận')?.click());await v.close();assert.equal(revoked.length,2);
 let release,signal;const w=await mount({actions:adapter({image:async(a,b,options)=>{signal=options.signal;return new Promise(r=>{release=r;});}})});dialog=await open(w);await act(async()=>button(dialog,'Xem ảnh').click());await w.close();assert.equal(signal.aborted,true);await act(async()=>release(new Blob(['late'],{type:'image/png'})));assert.equal(revoked.length,2);
 }finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;}
});
test('Late secret cannot survive close or account switch; wrong subject never renders',async()=>{
 let release,signal;const v=await mount({actions:adapter({content:async(a,options)=>{signal=options.signal;return new Promise(r=>{release=r;});}})});let dialog=await open(v);await act(async()=>button(dialog,'Xem nội dung đã nhận').click());await v.render({userId:imageId,accessToken:'new-session'});assert.equal(signal.aborted,true);await act(async()=>release({subjectId:subject,itemId:id,text:'STALE SECRET'}));assert.equal(document.body.textContent.includes('STALE SECRET'),false);assert.equal(document.querySelector('[role=dialog]'),null);assert.ok(v.host.querySelector('[role=alert]'));await v.close();
});
test('Partial delivery only displays returned items; paging and expired session errors do not become empty',async()=>{
 let expired=0;const v=await mount({actions:adapter({list:async({page,size})=>({subjectId:subject,page,size,total:6,accountState:'PARTIAL',items:Array.from({length:page===0?5:1},(_,i)=>({...item,itemId:`11111111-1111-4111-8111-${String(page*5+i+1).padStart(12,'0')}`,title:'Item '+(page*5+i)}))})})});assert.match(v.host.textContent,/Đã bàn giao một phần/);await act(async()=>button(v.host,'Sau').click());assert.match(v.host.textContent,/Item 5/);assert.doesNotMatch(v.host.textContent,/Item 0/);await v.close();
 const w=await mount({actions:adapter({list:async()=>{throw Object.assign(new Error('Expired'),{status:401});}}),onUnauthorized:()=>{expired++;}});assert.ok(expired>0);assert.match(w.host.textContent,/hết hạn/);assert.doesNotMatch(w.host.textContent,/Chưa có tài sản được bàn giao/);await w.close();
});
test('403 while reading content removes private detail and does not fallback to fixture',async()=>{
 const v=await mount({actions:adapter({content:async()=>{throw Object.assign(new Error('Denied'),{status:403});}})});const dialog=await open(v);await act(async()=>button(dialog,'Xem nội dung đã nhận').click());assert.equal(document.querySelector('[role=dialog]'),null);assert.ok(v.host.querySelector('[role=alert]'));assert.equal(v.host.textContent.includes('Synthetic received item'),false);await v.close();
});
const {default:ProductionReceived}=await loadComponentModule('src/pages/beneficiary/ReceivedAssets.jsx',true);
test('Production cannot show demo with query/preview flags; authenticated preview uses only injected live adapter',async()=>{
 let calls=0;const actions=adapter({list:async args=>{calls++;return {subjectId:subject,page:args.page,size:args.size,total:1,accountState:'RECEIVED',items:[item]};}});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(React.createElement(ProductionReceived,{isDevPreview:true,actions,userId:subject,lang:'en'})));assert.equal(calls,0);assert.match(host.textContent,/not available yet/);assert.doesNotMatch(host.textContent,/Demo data|Family keepsake/);
 await act(async()=>root.render(React.createElement(ProductionReceived,{isDevPreview:true,accessToken:'signed-in',actions,userId:subject,lang:'en'})));assert.equal(calls,1);assert.match(host.textContent,/Synthetic received item/);assert.doesNotMatch(host.textContent,/Demo data|Family keepsake/);
 }finally{await act(async()=>root.unmount());host.remove();}
});
const {default:DevApp}=await loadComponentModule('src/App.jsx');
const {default:ProdApp}=await loadComponentModule('src/App.jsx',true);
test('Actual App provides DEV anonymous preview but production query cannot bypass login',async()=>{
 window.sessionStorage.clear();window.localStorage.clear();window.history.replaceState({},'','/beneficiary?preview=true');
 const host=document.createElement('div');document.body.append(host);let root=createRoot(host);
 try{await act(async()=>root.render(React.createElement(DevApp)));await act(async()=>new Promise(r=>setTimeout(r,150)));assert.match(host.textContent,/Dữ liệu minh họa/);assert.match(host.textContent,/Kỷ vật gia đình/);
 await act(async()=>root.unmount());root=createRoot(host);await act(async()=>root.render(React.createElement(ProdApp)));assert.doesNotMatch(host.textContent,/Kỷ vật gia đình|chưa lưu lên máy chủ/);assert.match(host.textContent,/Đăng nhập/);
 }finally{await act(async()=>root.unmount());host.remove();window.sessionStorage.clear();window.localStorage.clear();}
});
test('Actual authenticated App wires received adapter and never uses preview fixtures',async()=>{
 const {createSession,storeSession}=await import('./session.js');const user={id:subject,fullName:'Synthetic beneficiary',email:'beneficiary@example.test',roles:['BENEFICIARY']};
 storeSession(createSession({accessToken:'synthetic-authenticated',tokenType:'Bearer',expiresInSeconds:3600,user}));window.history.replaceState({},'','/beneficiary?preview=true');
 const previous=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify(user),{status:200,headers:{'Content-Type':'application/json'}});
 let lists=0;const actions=adapter({list:async({page,size})=>{lists++;return {subjectId:subject,page,size,total:1,accountState:'RECEIVED',items:[item]};}});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(React.createElement(DevApp,{beneficiaryAssetActions:actions})));assert.ok(lists>0);assert.match(host.textContent,/Synthetic received item/);assert.doesNotMatch(host.textContent,/Kỷ vật gia đình|chưa lưu lên máy chủ/);
 }finally{await act(async()=>root.unmount());host.remove();globalThis.fetch=previous;window.sessionStorage.clear();window.localStorage.clear();}
});
