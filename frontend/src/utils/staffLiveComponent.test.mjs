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
const legalBuilt=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/pages/staff/StaffLegalDocumentsPage.jsx',formats:['es']},rollupOptions:{external:['react','react/jsx-runtime']}}});
let legalCode=(Array.isArray(legalBuilt)?legalBuilt[0]:legalBuilt).output.find(x=>x.type==='chunk'&&x.isEntry).code;
for(const name of ['react','react/jsx-runtime'])legalCode=legalCode.replaceAll('from "'+name+'"','from "'+import.meta.resolve(name)+'"');
const {default:LegalScreen}=await import('data:text/javascript;base64,'+Buffer.from(legalCode).toString('base64'));
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

test('PS-98/PS-103: Attachments pane expands, lists files, and handles preview modal lifecycle', async () => {
  let createdUrls = [];
  let revokedUrls = [];
  globalThis.URL.createObjectURL = (blob) => {
    const url = 'blob:http://localhost/test-' + Math.random();
    createdUrls.push(url);
    return url;
  };
  globalThis.URL.revokeObjectURL = (url) => {
    revokedUrls.push(url);
  };

  const sampleDoc = {
    id,
    caseId: id,
    documentType: 'DEATH_CERTIFICATE',
    issuingAuthority: 'UBND Q1',
    documentNumber: '123/2026',
    issuedDate: '2026-10-10',
    deliveredByName: 'Nguyen Van A',
    receivedAt: '2026-10-20T05:00:00Z',
    receivedBy: id,
  };

  const sampleAttachment = {
    id: '33333333-3333-4333-8333-333333333333',
    caseId: id,
    subjectType: 'DEATH_DOCUMENT',
    subjectId: id,
    uploadedBy: id,
    fileName: 'giay_chung_tu.pdf',
    sizeBytes: 2048,
    contentType: 'application/pdf',
    sha256: 'a'.repeat(64),
    uploadedAt: '2026-10-21T10:00:00Z',
  };

  globalThis.fetch = async (url, init) => {
    if (url.includes('/attachments/') && url.endsWith('/content')) {
      return new Response(new Blob(['pdf-bytes'], { type: 'application/pdf' }), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      });
    }
    if (url.endsWith('/attachments')) {
      return json([sampleAttachment]);
    }
    if (url.endsWith('death-documents')) {
      return json([sampleDoc]);
    }
    return json(detail);
  };

  const v = await mount();

  // Wait for initial docs to load
  await act(async () => {});

  // Find toggle attachments button
  const toggleBtn = button(v.host, 'Tệp đính kèm') || button(v.host, 'Attachments');
  assert.ok(toggleBtn, 'Toggle attachments button must exist');

  // Click toggle to load attachments
  await act(async () => {
    toggleBtn.click();
  });

  // Verify attachment file name is rendered
  assert.match(v.host.textContent, /giay_chung_tu.pdf/);

  // Find view attachment button
  const viewBtn = button(v.host, 'Xem') || button(v.host, 'View');
  assert.ok(viewBtn, 'View attachment button must exist');

  // Click view to trigger blob read and modal open
  await act(async () => {
    viewBtn.click();
  });

  assert.equal(createdUrls.length, 1);
  assert.ok(v.host.querySelector('.lv-evidence-preview-modal'), 'Preview modal must be open');

  // Close preview modal
  const closeBtn = v.host.querySelector('.lv-modal__close-btn');
  assert.ok(closeBtn, 'Modal close button must exist');
  await act(async () => {
    closeBtn.click();
  });

  assert.ok(revokedUrls.length >= 1, 'Object URL must be revoked');
  assert.equal(revokedUrls[0], createdUrls[0]);
  assert.equal(v.host.querySelector('.lv-evidence-preview-modal'), null, 'Modal must be closed');

  await v.close();
});

test('Attachment read aborts on account switch and late bytes never open a preview', async () => {
  const attachment = {id, caseId:id, subjectId:id, subjectType:'DEATH_DOCUMENT', uploadedBy:id,
    fileName:'proof.pdf', sizeBytes:2048, contentType:'application/pdf', sha256:'a'.repeat(64), uploadedAt:'2026-10-21T00:00:00Z'};
  let release, signal, created = 0;
  globalThis.URL.createObjectURL = () => { created++; return 'blob:test'; };
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/content')) { signal=init.signal; return new Promise(r=>{release=r;}); }
    if (url.endsWith('/attachments')) return json([attachment]);
    return json(url.endsWith('death-documents') ? [{id,caseId:id,receivedBy:id,receivedAt:'2026-10-21T00:00:00Z'}] : detail);
  };
  const v=await mount();
  await act(async()=>button(v.host,'Tệp đính kèm').click());
  assert.match(v.host.textContent,/2\.0 KB/);
  await act(async()=>button(v.host,'Xem tệp').click());
  await act(async()=>v.root.render(React.createElement(Screen,{...v.options,accessToken:'changed'})));
  assert.equal(signal.aborted,true);
  await act(async()=>release(new Response('late bytes')));
  assert.equal(created,0);
  assert.equal(v.host.querySelector('[role=dialog]'),null);
  await v.close();
});

test('Switching document category clears staged evidence before creating another record', async () => {
  globalThis.fetch=async(url)=>json(url.endsWith('death-documents')||url.endsWith('original-will-intakes')?[]:detail);
  const v=await mount();
  const file=new File(['pdf'],'death.pdf',{type:'application/pdf'});
  await act(async()=>props(v.host.querySelector('fieldset input[type=file]')).onChange({target:{files:[file]}}));
  assert.match(v.host.textContent,/death.pdf/);
  await act(async()=>props(v.host.querySelector('select')).onChange({target:{value:'original-will-intakes'}}));
  assert.doesNotMatch(v.host.textContent,/death.pdf/);
  await v.close();
});

test('COURT preview aborts when case changes; late file cannot enter the new case', async () => {
  let signal, release, created=0;
  globalThis.URL.createObjectURL=()=>{created++;return 'blob:late';};
  const dossier={caseId:id,route:'COURT',status:'LEGAL_BASIS_PROVIDED',versions:[{version:1,contentType:'application/pdf',sha256:'a'.repeat(64),allocations:[]}]};
  globalThis.fetch=async(url,init)=>{
    if(url.endsWith('/content')){signal=init.signal;return new Promise(r=>{release=r;});}
    if(url.includes('/assets?')) return json({content:[],page:0,size:100,totalElements:0,totalPages:0});
    if(url.endsWith('/beneficiaries')) return json([]);
    return json(dossier);
  };
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try {
    await act(async()=>root.render(React.createElement(LegalScreen,{caseId:id,accessToken:'synthetic',lang:'en'})));
    await act(async()=>button(host,'View document file').click());
    await act(async()=>root.render(React.createElement(LegalScreen,{caseId:'22222222-2222-4222-8222-222222222222',accessToken:'synthetic',lang:'en'})));
    assert.equal(signal.aborted,true);
    await act(async()=>release(new Response('old case')));
    assert.equal(created,0);assert.equal(host.querySelector('.lv-evidence-preview-modal'),null);
  } finally {await act(async()=>root.unmount());host.remove();}
});

test('Attachment unauthorized response invokes session handler and locks upload', async () => {
  let unauthorized=0;
  globalThis.fetch=async(url)=>url.endsWith('/attachments')?json({code:'UNAUTHENTICATED'},401):json(url.endsWith('death-documents')?[{id,caseId:id,receivedBy:id,receivedAt:'2026-10-21T00:00:00Z'}]:detail);
  const v=await mount();
  await act(async()=>v.root.render(React.createElement(Screen,{...v.options,onUnauthorized(){unauthorized++;}})));
  await act(async()=>button(v.host,'Tệp đính kèm').click());
  assert.equal(unauthorized,1);assert.equal(v.host.querySelector('.lv-staff-attachment-upload-box input').disabled,true);
  await v.close();
});

test('Failed initial attachment moves file to saved record; retry never stages it for the next record', async () => {
  let writes=0, uploads=0;
  const previousXhr=globalThis.XMLHttpRequest;
  class Xhr {
    upload={}; open(){} setRequestHeader(){} abort(){this.onabort?.();}
    send(){ uploads++; this.status=uploads===1?500:201;
      this.responseText=JSON.stringify(this.status===500?{code:'INTERNAL_ERROR'}:{id,caseId:id,subjectId:id,
        subjectType:'DEATH_DOCUMENT',uploadedBy:id,fileName:'saved.pdf',sizeBytes:3,
        contentType:'application/pdf',sha256:'a'.repeat(64),uploadedAt:'2026-10-21T00:00:00Z'});
      queueMicrotask(()=>this.onload()); }
  }
  globalThis.XMLHttpRequest=Xhr;
  globalThis.fetch=async(url,init)=>{
    if(init.method==='POST'){writes++;return json({id:writes===1?id:'22222222-2222-4222-8222-222222222222',caseId:id,receivedBy:id,receivedAt:'2026-10-21T00:00:00Z'},201);}
    return json(url.endsWith('death-documents')||url.endsWith('/attachments')?[]:detail);
  };
  const v=await mount();
  try {
    await act(async()=>props(v.host.querySelector('fieldset input[type=file]')).onChange({target:{files:[new File(['pdf'],'saved.pdf',{type:'application/pdf'})]}}));
    await act(async()=>props(v.host.querySelector('form')).onSubmit({preventDefault(){}}));
    assert.equal(writes,1); assert.equal(uploads,1);
    assert.doesNotMatch(v.host.querySelector('form').textContent,/saved.pdf/);
    await act(async()=>button(v.host,'Tải lên đính kèm').click());
    assert.equal(uploads,2); assert.equal(writes,1);
    await act(async()=>props(v.host.querySelector('form')).onSubmit({preventDefault(){}}));
    assert.equal(writes,2); assert.equal(uploads,2);
  } finally { await v.close(); globalThis.XMLHttpRequest=previousXhr; }
});

test('Pending attachment upload rejects double submit and aborts on category change', async () => {
  let sends=0, aborted=0;
  const prior=globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest=class {
    upload={}; open(){} setRequestHeader(){} send(){sends++;} abort(){aborted++;}
  };
  globalThis.fetch=async(url)=>json(url.endsWith('/attachments')||url.endsWith('original-will-intakes')?[]:
    url.endsWith('death-documents')?[{id,caseId:id,receivedBy:id,receivedAt:'2026-10-21T00:00:00Z'}]:detail);
  const v=await mount();
  try {
    await act(async()=>button(v.host,'Tệp đính kèm').click());
    await act(async()=>props(v.host.querySelector('.lv-staff-attachment-upload-box input')).onChange({target:{files:[new File(['pdf'],'x.pdf',{type:'application/pdf'})]}}));
    const send=props(button(v.host,'Tải lên đính kèm')).onClick;
    await act(async()=>{send();send();});
    assert.equal(sends,1);
    await act(async()=>props(v.host.querySelector('select')).onChange({target:{value:'original-will-intakes'}}));
    assert.equal(aborted,1);assert.doesNotMatch(v.host.textContent,/Đính kèm tệp chứng cứ thành công/);
  } finally {await v.close();globalThis.XMLHttpRequest=prior;}
});
