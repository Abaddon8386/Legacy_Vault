// Real local API smoke. Creates only new synthetic accounts/records; never alters existing data.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const base='http://localhost:8080/api/v1';
const email=`codex-${randomUUID()}@example.test`;
const password=process.env.CODEX_TEST_PASSWORD;
if(!password)throw new Error('CODEX_TEST_PASSWORD required; do not log credentials');
let token;
async function call(method,path,body,expected=200){
 const res=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const data=await res.json().catch(()=>null);assert.equal(res.status,expected,`${method} ${path}: ${data?.code||res.status}`);return data;
}
await call('POST','/auth/register',{fullName:'Synthetic guardian document check',email,password},201);
const session=await call('POST','/auth/login',{email,password});token=session.accessToken;
const vault=await call('POST','/vaults',{name:'Synthetic integration 2026-10-22'},201);
const beneficiary=await call('POST',`/vaults/${vault.id}/beneficiaries`,{fullName:'Synthetic minor',dateOfBirth:'2015-01-01',relationship:'Child'},201);
const root=`/vaults/${vault.id}/beneficiaries/${beneficiary.id}/guardian`;
let ctx=await call('GET',root);assert.equal(ctx.ageStatus,'MINOR');assert.equal(ctx.guardian,null);
ctx=await call('PUT',root,{expectedRevision:ctx.revision,fullName:'Synthetic guardian',relationship:'Parent',email:'guardian@example.test'});assert.equal(ctx.guardian.fullName,'Synthetic guardian');
await call('PUT',root,{expectedRevision:0,fullName:'Stale guardian',relationship:'Parent',email:'guardian@example.test'},409);
ctx=await call('PUT',root,{expectedRevision:ctx.revision,fullName:'Synthetic replacement',relationship:'Parent',phone:'0900000000'});
assert.equal((await call('GET',root)).guardian.fullName,'Synthetic replacement');
ctx=await call('POST',root+'/revoke',{expectedRevision:ctx.revision});assert.equal(ctx.guardian,null);
assert.equal((await call('GET',root+'/history?page=0&size=20')).content.length,2);
const asset=await call('POST',`/vaults/${vault.id}/assets`,{name:'Synthetic PDF Word asset',assetType:'TEXT',payload:'Synthetic content; no legal value'},201);
const docRoot=`/vaults/${vault.id}/assets/${asset.id}/documents`;
const documents=[];
for(const name of ['synthetic.pdf','synthetic.docx']){
 const bytes=await readFile(new URL(`../../docs/evidence/guardian-documents-2026-10-22/${name}`,import.meta.url));
 const type=name.endsWith('.pdf')?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
 const form=new FormData();form.append('documents',new Blob([bytes],{type}),name);
 const res=await fetch(base+docRoot,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});
 const receipt=await res.json();assert.equal(res.status,201,receipt.code);
 const doc=receipt.find(item=>item.fileName===name);assert.ok(doc);assert.equal(doc.sha256,createHash('sha256').update(bytes).digest('hex'));
 await call('POST',`${docRoot}/${doc.id}/download`,{password:'WrongSyntheticPassword'},403);
 const download=await fetch(base+`${docRoot}/${doc.id}/download`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({password})});
 assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),bytes);
 documents.push({id:doc.id,fileName:doc.fileName,sha256:doc.sha256,sizeBytes:doc.sizeBytes});
}
assert.equal((await call('GET',docRoot)).length,2);
const bad=new FormData();bad.append('documents',new Blob(['not a PDF'],{type:'application/pdf'}),'invalid.pdf');
const rejected=await fetch(base+docRoot,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:bad});assert.equal(rejected.status,415);
assert.equal((await call('GET',docRoot)).length,2);
const report={checkedOn:'2026-10-22',email,vaultId:vault.id,beneficiaryId:beneficiary.id,assetId:asset.id,checks:['register/login','minor creation without guardian gate','guardian create/replace/revoke/history/reload','stale revision rejected','PDF and DOCX upload/list/download byte equality','wrong password rejected','invalid PDF rejected without partial save'],documents};
await mkdir('docs/evidence/guardian-documents-2026-10-22',{recursive:true});
await writeFile('docs/evidence/guardian-documents-2026-10-22/api-result.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
