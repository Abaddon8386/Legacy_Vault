import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost/staff/asset-handover'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const rootPath = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const entryPath = new URL('../pages/staff/ScopedAssetHandoverPage.jsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const built=await build({root:rootPath,configFile:false,plugins:[react()],logLevel:'silent',build:{write:false,minify:false,lib:{entry:entryPath,formats:['es']},rollupOptions:{external:['react','react/jsx-runtime']}}});
let code=(Array.isArray(built)?built[0]:built).output.find(x=>x.type==='chunk'&&x.isEntry).code;
for(const n of ['react','react/jsx-runtime'])code=code.replaceAll('from "'+n+'"','from "'+import.meta.resolve(n)+'"');
const Page=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const a='11111111-1111-4111-8111-111111111111',s='22222222-2222-4222-8222-222222222222',r='33333333-3333-4333-8333-333333333333',asset='44444444-4444-4444-8444-444444444444';
const r2='77777777-7777-4777-8777-777777777777',asset2='88888888-8888-4888-8888-888888888888';
const json=x=>new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}});

async function run(check, customFetch){
  let posts=0;
  const postBodies=[];
  const prior=globalThis.fetch;
  globalThis.fetch=async(url,init={})=>{
    if(init.method==='POST'){
      posts++;
      if(init.body) postBodies.push(JSON.parse(init.body));
      if(customFetch) return customFetch(url,init);
      return json([]);
    }
    if(customFetch) return customFetch(url,init);
    return json([{assetId:asset,recipientId:r,description:'Asset X',deliveryStatus:'PENDING'}]);
  };
  const host=document.createElement('div');
  document.body.append(host);
  const root=createRoot(host);
  try{
    await act(async()=>root.render(React.createElement(Page,{caseId:a,sessionId:s,accessToken:'real-token'})));
    await check(host,()=>posts,postBodies);
  }finally{
    await act(async()=>root.unmount());
    host.remove();
    globalThis.fetch=prior;
  }
}

// 2 regression tests gốc từ reviewer
test('review: row action must open review before any delivery POST',()=>run(async(host,posts)=>{
  const btn=host.querySelector('.lv-btn-record-handover');
  assert.ok(btn);
  await act(async()=>btn.click());
  assert.equal(posts(),0,'row button bypasses review and posts immediately');
}));

test('review: empty delivery receipt must not mark asset delivered',()=>run(async(host,posts)=>{
  const btn=host.querySelector('.lv-btn-record-handover');
  assert.ok(btn);
  await act(async()=>btn.click());
  const confirm=host.querySelector('.lv-btn-confirm-deliver');
  assert.ok(confirm);
  await act(async()=>confirm.click());
  assert.equal(posts(),1,'The empty response must actually be received after confirming');
  assert.ok(host.querySelector('.lv-api-status-banner--error'));
  assert.equal(Boolean(host.querySelector('.lv-status-pill--delivered')),false,'empty response still marks requested asset DELIVERED');
}));

// Test Finding B: Hủy review modal -> ZERO POST
test('review: modal cancel results in ZERO POST and closes modal',()=>run(async(host,posts)=>{
  const btn=host.querySelector('.lv-btn-record-handover');
  assert.ok(btn);
  await act(async()=>btn.click());
  assert.ok(host.querySelector('.lv-handover-modal-dialog'),'Review modal dialog must be visible');
  const cancelBtn=host.querySelector('.lv-btn-cancel-review');
  assert.ok(cancelBtn,'Cancel button must be visible');
  await act(async()=>cancelBtn.click());
  assert.equal(posts(),0,'Cancel review modal must not trigger POST');
  assert.equal(host.querySelector('.lv-handover-modal-dialog'),null,'Review modal dialog must be closed');
}));

// Test Finding A & B: Xác nhận modal -> 1 POST đúng payload, chỉ đánh DELIVERED khi server xác nhận
test('review: modal confirm sends exact payload and marks DELIVERED on valid receipt',()=>run(async(host,posts,bodies)=>{
  const btn=host.querySelector('.lv-btn-record-handover');
  assert.ok(btn);
  await act(async()=>btn.click());
  const confirmBtn=host.querySelector('.lv-btn-confirm-deliver');
  assert.ok(confirmBtn,'Confirm button must exist in modal');
  await act(async()=>confirmBtn.click());
  assert.equal(posts(),1,'Confirm modal must send exactly one POST');
  assert.deepEqual(bodies[0],{recipientId:r,assetIds:[asset]});
  assert.ok(host.querySelector('.lv-status-pill--delivered'),'Asset must be marked DELIVERED when server confirms');
},async(url,init)=>{
  if(init.method==='POST'){
    return json([{
      itemId:a,
      sessionId:s,
      recipientId:r,
      assetId:asset,
      status:'DELIVERED',
      staffId:a,
      deliveredAt:'2026-10-20T08:00:00Z',
    }]);
  }
  return json([{assetId:asset,recipientId:r,description:'Asset X',deliveryStatus:'PENDING'}]);
}));

// Test Finding A: Mismatched recipient or status in receipt rejects false success
test('review: receipt with mismatched recipient does NOT mark asset DELIVERED and shows error',()=>run(async(host,posts)=>{
  const btn=host.querySelector('.lv-btn-record-handover');
  assert.ok(btn);
  await act(async()=>btn.click());
  const confirmBtn=host.querySelector('.lv-btn-confirm-deliver');
  assert.ok(confirmBtn);
  await act(async()=>confirmBtn.click());
  assert.equal(posts(),1,'Should attempt POST once without retry');
  assert.equal(Boolean(host.querySelector('.lv-status-pill--delivered')),false,'Mismatched recipient must not mark delivered');
  assert.ok(host.querySelector('.lv-api-status-banner--error'),'Error alert must be displayed');
},async(url,init)=>{
  if(init.method==='POST'){
    return json([{
      itemId:a,
      sessionId:s,
      recipientId:r2, // Khác r
      assetId:asset,
      status:'DELIVERED',
      staffId:a,
      deliveredAt:'2026-10-20T08:00:00Z',
    }]);
  }
  return json([{assetId:asset,recipientId:r,description:'Asset X',deliveryStatus:'PENDING'}]);
}));

// Test Finding A: 409 Conflict handled properly without retry POST
let conflictGets = 0;
test('review: 409 Conflict triggers reload and does not retry POST',()=>run(async(host,posts)=>{
  const before = conflictGets;
  const btn=host.querySelector('.lv-btn-record-handover');
  assert.ok(btn);
  await act(async()=>btn.click());
  const confirmBtn=host.querySelector('.lv-btn-confirm-deliver');
  assert.ok(confirmBtn);
  await act(async()=>confirmBtn.click());
  assert.equal(posts(),1,'Conflict must not trigger auto-retry POST');
  assert.ok(conflictGets > before,'Conflict must reload authoritative assets');
  assert.equal(Boolean(host.querySelector('.lv-status-pill--delivered')),false);
  assert.ok(host.querySelector('.lv-api-status-banner--error'),'Conflict error must be shown to staff');
},async(url,init)=>{
  if(init.method==='POST'){
    return new Response(JSON.stringify({code:'CONFLICT',message:'Handover session changed'}),{status:409,headers:{'Content-Type':'application/json'}});
  }
  conflictGets++;
  return json([{assetId:asset,recipientId:r,description:'Asset X',deliveryStatus:'PENDING'}]);
}));

// Test Finding B & C: Switching recipient resets selection, Recipient B is isolated from Recipient A
test('review: switching recipient resets selection and preserves isolation between recipients',()=>run(async(host)=>{
  const select=host.querySelector('select.lv-handover-recipient-select');
  assert.ok(select,'Recipient select must exist');

  // Khi có nhiều người nhận, chọn người nhận 1
  await act(async()=>{
    select.value=r;
    select.dispatchEvent(new window.Event('change',{bubbles:true}));
  });
  assert.ok(host.textContent.includes('Asset 1'),'Asset 1 belongs to recipient 1');

  // Mở review modal cho recipient 1
  const rowBtn=host.querySelector('.lv-btn-record-handover');
  assert.ok(rowBtn);
  await act(async()=>rowBtn.click());
  assert.ok(host.querySelector('.lv-handover-modal-dialog'),'Review modal opened for recipient 1');
  const confirm=host.querySelector('.lv-btn-confirm-deliver');
  assert.ok(confirm);
  await act(async()=>confirm.click());
  assert.ok(host.querySelector('.lv-status-pill--delivered'),'A must actually be delivered before checking B isolation');

  // Đổi người nhận sang r2
  await act(async()=>{
    select.value=r2;
    select.dispatchEvent(new window.Event('change',{bubbles:true}));
  });

  // Modal của recipient 1 phải bị đóng
  assert.equal(host.querySelector('.lv-handover-modal-dialog'),null,'Modal must close when switching recipient');

  // Bảng hiển thị tài sản của recipient 2
  assert.ok(host.textContent.includes('Asset 2'),'Table must show recipient 2 assets');
  assert.equal(host.textContent.includes('Asset 1'),false,'Recipient 1 assets must not show under recipient 2');
  assert.equal(Boolean(host.querySelector('.lv-status-pill--delivered')),false,'Recipient 2 assets are still PENDING');
  await act(async()=>{
    select.value=r;
    select.dispatchEvent(new window.Event('change',{bubbles:true}));
  });
  assert.ok(host.querySelector('.lv-status-pill--delivered'),'A remains delivered after switching back');
},async(url,init)=>{
  if(init.method==='POST'){
    return json([{
      itemId:a,sessionId:s,recipientId:r,assetId:asset,status:'DELIVERED',staffId:a,deliveredAt:'2026-10-20T08:00:00Z'
    }]);
  }
  return json([
    {assetId:asset,recipientId:r,description:'Asset 1',deliveryStatus:'PENDING'},
    {assetId:asset2,recipientId:r2,description:'Asset 2',deliveryStatus:'PENDING'},
  ]);
}));

for (const [name, receipt] of [
  ['missing receipt fields', [{sessionId:s,recipientId:r,assetId:asset,status:'DELIVERED'}]],
  ['wrong session', [{itemId:a,sessionId:a,recipientId:r,assetId:asset,status:'DELIVERED',staffId:a,deliveredAt:'2026-10-20T08:00:00'}]],
  ['wrong asset', [{itemId:a,sessionId:s,recipientId:r,assetId:asset2,status:'DELIVERED',staffId:a,deliveredAt:'2026-10-20T08:00:00'}]],
]) {
  test(`review: ${name} after confirm shows uncertainty and reloads without retry`,()=>{
    let gets=0;
    return run(async(host,posts)=>{
      const before=gets;
      const row=host.querySelector('.lv-btn-record-handover');assert.ok(row);
      await act(async()=>row.click());
      const confirm=host.querySelector('.lv-btn-confirm-deliver');assert.ok(confirm);
      await act(async()=>confirm.click());
      assert.equal(posts(),1);
      assert.ok(gets>before);
      assert.equal(Boolean(host.querySelector('.lv-status-pill--delivered')),false);
      assert.ok(host.querySelector('.lv-api-status-banner--error'));
    },async(url,init)=>{
      if(init.method==='POST')return json(receipt);
      gets++;return json([{assetId:asset,recipientId:r,description:'Asset X',deliveryStatus:'ELIGIBLE'}]);
    });
  });
}
