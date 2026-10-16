import test from 'node:test';
import assert from 'node:assert/strict';
import {willService,readWillReceipt,computeFileSha256} from './willService.js';
import {getWillUploadErrors,MAX_FILE_SIZE_BYTES} from './willValidation.js';
const vault='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const file=new File(['%PDF-1.4 synthetic'], 'sample.pdf',{type:'application/pdf'});
const hash=await computeFileSha256(file);
const receipt={id,vaultId:vault,status:'UPLOADED',createdAt:'2026-10-13T00:00:00Z',currentVersion:{version:1,fileName:file.name,contentType:file.type,sizeBytes:file.size,sha256:hash,uploadedAt:'2026-10-13T00:00:00Z'}};
function fakeXhr(status=201,data=receipt,onSend=()=>{}) {return {upload:{},status,responseText:JSON.stringify(data),headers:{},open(method,url){this.method=method;this.url=url;},setRequestHeader(name,value){this.headers[name]=value;},getResponseHeader(){return 'application/json';},send(body){onSend(this,body);this.upload.onprogress?.({lengthComputable:true,loaded:10,total:10});this.onload?.();},abort(){this.onabort?.();}};}
test('PS-7 upload uses multipart, Bearer/base/locale and actual progress then validated receipt',async()=>{
 const progress=[];const got=await willService.uploadWill(vault,file,' note ',{accessToken:'synthetic',lang:'en',onProgress:value=>progress.push(value),xhrFactory:()=>fakeXhr(201,{...receipt,token:'NEVER-RETURN'},(xhr,body)=>{assert.equal(xhr.method,'POST');assert.equal(xhr.url,'/api/v1/vaults/'+vault+'/wills');assert.equal(xhr.headers.Authorization,'Bearer synthetic');assert.equal(xhr.headers['Accept-Language'],'en');assert.equal(xhr.headers['Content-Type'],undefined);assert.equal(xhr.withCredentials,false);assert.equal(body.get('note'),'note');assert.equal(body.get('file').size,file.size);})});assert.equal(got.token,undefined);assert.equal(got.status,'UPLOADED');assert.deepEqual(progress,[0,99,100]);
});
test('PS-7 rejects legal state, foreign vault, missing/wrong server hash and malformed metadata',()=>{
 for(const bad of [{...receipt,status:'LEGAL_APPROVED'},{...receipt,vaultId:id},{...receipt,currentVersion:{...receipt.currentVersion,sha256:null}},{...receipt,currentVersion:{...receipt.currentVersion,sha256:'0'.repeat(64)}},{...receipt,currentVersion:{...receipt.currentVersion,version:2}},{...receipt,createdAt:'2026-10-13T00:00:00'}]) assert.throws(()=>readWillReceipt(bad,vault,file,hash),{code:'BACKEND_NOT_READY'});
});
test('PS-7 validates file/size/note/type before network without claiming content inspection',async()=>{
 assert.deepEqual(getWillUploadErrors({file:null}),{file:'fileRequired'});
 assert.equal(getWillUploadErrors({file:{size:MAX_FILE_SIZE_BYTES+1,type:'application/pdf'}}).file,'fileSizeExceeded');
 assert.equal(getWillUploadErrors({file:new File([],'a.pdf',{type:'application/pdf'})}).file,'fileEmpty');
 assert.equal(getWillUploadErrors({file:new File(['abc'],'a.exe',{type:'application/octet-stream'})}).file,'fileTypeInvalid');
 assert.equal(getWillUploadErrors({file,note:'x'.repeat(501)}).note,'noteTooLong');
 await assert.rejects(willService.uploadWill(vault,null,'',{xhrFactory:()=>{throw Error('Must not call network');}}),{code:'FILE_REQUIRED'});
});
test('PS-7 preserves safe error codes/status/trace for UI 401/403/404/413/415/409',async()=>{
 for(const [status,code] of [[401,'UNAUTHENTICATED'],[403,'ACCESS_DENIED'],[404,'RESOURCE_NOT_FOUND'],[413,'PAYLOAD_TOO_LARGE'],[415,'UNSUPPORTED_MEDIA_TYPE'],[409,'VAULT_NOT_EDITABLE']]) await assert.rejects(willService.uploadWill(vault,file,'',{xhrFactory:()=>fakeXhr(status,{code,message:'SQL SECRET',traceId:'trace'})}),error=>error.status===status && error.code===code && error.traceId==='trace' && !error.message.includes('SQL SECRET'));
});
test('PS-7 abort, timeout, non-201 and wrong hash never show completion',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(willService.uploadWill(vault,file,'',{signal:controller.signal}),{code:'ABORTED'});
 const progress=[];await assert.rejects(willService.uploadWill(vault,file,'',{onProgress:value=>progress.push(value),xhrFactory:()=>fakeXhr(201,{...receipt,currentVersion:{...receipt.currentVersion,sha256:'0'.repeat(64)}})}),{code:'BACKEND_NOT_READY'});assert.ok(!progress.includes(100));
 await assert.rejects(willService.uploadWill(vault,file,'',{xhrFactory:()=>fakeXhr(200)}),{code:'BACKEND_NOT_READY'});
 await assert.rejects(willService.uploadWill(vault,file,'',{xhrFactory:()=>{const xhr=fakeXhr();xhr.send=()=>xhr.ontimeout();return xhr;}}),{code:'TIMEOUT'});
});
test('PS-7 abort after send disconnects handlers and different bytes have different SHA256',async()=>{
 const controller=new AbortController();let xhr;
 await assert.rejects(willService.uploadWill(vault,file,'',{signal:controller.signal,xhrFactory:()=>{xhr=fakeXhr();xhr.send=()=>controller.abort();return xhr;}}),{code:'ABORTED'});assert.equal(xhr.onload,null);assert.equal(xhr.upload.onprogress,null);
 assert.notEqual(hash,await computeFileSha256(new File(['different'],'b.pdf',{type:'application/pdf'})));
});

test('PS-7 readWillVersionReceipt validates version > 1 and willId matching', async () => {
 const { readWillVersionReceipt } = await import('./willService.js');
 const v2Receipt = {
   id, vaultId: vault, status: 'UPLOADED', createdAt: '2026-10-13T00:00:00Z',
   currentVersion: { version: 2, fileName: file.name, contentType: file.type, sizeBytes: file.size, sha256: hash, uploadedAt: '2026-10-13T01:00:00Z' }
 };
 const validated = readWillVersionReceipt(v2Receipt, vault, id, file, hash, 2);
 assert.equal(validated.currentVersion.version, 2);
 assert.equal(validated.id, id);

 // Rejects if version < minVersion
 assert.throws(() => readWillVersionReceipt({ ...v2Receipt, currentVersion: { ...v2Receipt.currentVersion, version: 1 } }, vault, id, file, hash, 2), { code: 'BACKEND_NOT_READY' });
 // Rejects if wrong willId
 assert.throws(() => readWillVersionReceipt(v2Receipt, vault, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', file, hash, 2), { code: 'BACKEND_NOT_READY' });
});

test('PS-7 uploadNewVersion sends multipart file to /versions endpoint', async () => {
 const v2Receipt = {
   id, vaultId: vault, status: 'UPLOADED', createdAt: '2026-10-13T00:00:00Z',
   currentVersion: { version: 2, fileName: file.name, contentType: file.type, sizeBytes: file.size, sha256: hash, uploadedAt: '2026-10-13T01:00:00Z' }
 };
 const got = await willService.uploadNewVersion(vault, id, file, {
   accessToken: 'synthetic',
   lang: 'en',
   xhrFactory: () => fakeXhr(201, v2Receipt, (xhr, body) => {
     assert.equal(xhr.method, 'POST');
     assert.equal(xhr.url, `/api/v1/vaults/${vault}/wills/${id}/versions`);
     assert.equal(xhr.headers.Authorization, 'Bearer synthetic');
     assert.equal(body.get('file').size, file.size);
   })
 });
 assert.equal(got.currentVersion.version, 2);
});

test('PS-7 getWills and listWillVersions fetch and normalize records', async () => {
 const originalFetch = globalThis.fetch;
 try {
   globalThis.fetch = async (url) => {
     if (url.includes('/versions')) {
       return new Response(JSON.stringify([
         { version: 2, fileName: 'will-v2.pdf', contentType: 'application/pdf', sizeBytes: 1024, sha256: hash, uploadedAt: '2026-10-13T01:00:00Z' },
         { version: 1, fileName: 'will-v1.pdf', contentType: 'application/pdf', sizeBytes: 1024, sha256: hash, uploadedAt: '2026-10-13T00:00:00Z' },
       ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
     }
     return new Response(JSON.stringify({
       content: [{
         id, vaultId: vault, status: 'UPLOADED', createdAt: '2026-10-13T00:00:00Z',
         currentVersion: { version: 2, fileName: 'will-v2.pdf', contentType: 'application/pdf', sizeBytes: 1024, sha256: hash, uploadedAt: '2026-10-13T01:00:00Z' }
       }],
       totalElements: 1, totalPages: 1, page: 0, size: 20,
     }), { status: 200, headers: { 'Content-Type': 'application/json' } });
   };

   const list = await willService.getWills(vault);
   assert.equal(list.totalElements, 1);
   assert.equal(list.content[0].currentVersion.version, 2);

   const versions = await willService.listWillVersions(vault, id);
   assert.equal(versions.length, 2);
   assert.equal(versions[0].version, 2);
 } finally {
   globalThis.fetch = originalFetch;
 }
});

test('PS-7 downloadWillVersion handles binary response, Content-Disposition, and propagates errors', async () => {
 const originalFetch = globalThis.fetch;
 try {
   // Success binary download
   globalThis.fetch = async (url, init) => {
     assert.equal(init.method, 'POST');
     assert.deepEqual(JSON.parse(init.body), { password: 'SecretPassword' });
     return new Response(new Blob(['%PDF-1.4 mock content']), {
       status: 200,
       headers: {
         'Content-Type': 'application/pdf',
         'Content-Disposition': "attachment; filename*=UTF-8''my-clean-will.pdf",
       },
     });
   };

   const dl = await willService.downloadWillVersion(vault, id, 1, 'SecretPassword');
   assert.equal(dl.fileName, 'my-clean-will.pdf');
   assert.equal(dl.contentType, 'application/pdf');
   assert.ok(dl.blob instanceof Blob);

   // Password validation
   await assert.rejects(() => willService.downloadWillVersion(vault, id, 1, ''), { code: 'VALIDATION_FAILED' });
   await assert.rejects(() => willService.downloadWillVersion(vault, id, 1, 'x'.repeat(73)), { code: 'VALIDATION_FAILED' });

   // REAUTH_FAILED (403)
   globalThis.fetch = async () => new Response(JSON.stringify({ code: 'REAUTH_FAILED', status: 403 }), {
     status: 403, headers: { 'Content-Type': 'application/json' },
   });
   await assert.rejects(() => willService.downloadWillVersion(vault, id, 1, 'WrongPass'), (err) => {
     assert.equal(err.status, 403);
     assert.equal(err.code, 'REAUTH_FAILED');
     return true;
   });

   // TOO_MANY_ATTEMPTS (429)
   globalThis.fetch = async () => new Response(JSON.stringify({ code: 'TOO_MANY_ATTEMPTS', status: 429 }), {
     status: 429, headers: { 'Content-Type': 'application/json' },
   });
   await assert.rejects(() => willService.downloadWillVersion(vault, id, 1, 'WrongPass'), (err) => {
     assert.equal(err.status, 429);
     assert.equal(err.code, 'TOO_MANY_ATTEMPTS');
     return true;
   });
 } finally {
   globalThis.fetch = originalFetch;
 }
});
