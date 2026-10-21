import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadStaffCase,
  claimStaffCase,
  staffDocuments,
  staffDocumentAttachments,
  uploadStaffDocumentAttachment,
  readStaffDocumentAttachmentContent,
  readStaffBasisVersionContent,
} from '../pages/staff/staffLiveService.js';
const id='12345678-1234-4234-8234-123456789012';
const record={id,caseId:id,receivedBy:id,receivedAt:'2026-10-20T05:00:00Z'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('Staff detail and claim use scoped endpoints, bearer, locale and abort',async()=>{
 const calls=[]; const signal=new AbortController().signal;
 const options={accessToken:'synthetic',lang:'en',signal,fetchFn:async(url,init)=>{calls.push({url,init});return json({caseId:id,status:'OPEN'});}};
 await loadStaffCase(id,options);await claimStaffCase(id,options);
 assert.equal(calls[0].url,'/api/v1/staff/verification-cases/'+id);
 assert.equal(calls[1].url,calls[0].url+'/claim');assert.equal(calls[1].init.method,'POST');
 assert.equal(calls[0].init.headers.Authorization,'Bearer synthetic');assert.equal(calls[0].init.headers['Accept-Language'],'en');assert.equal(calls[0].init.signal,signal);
});
for(const kind of ['death-documents','original-will-intakes'])test('Document receipt and field whitelist: '+kind,async()=>{
 let sent; const values={documentType:'DEATH_CERTIFICATE',issuingAuthority:' Test ',documentNumber:'123',issuedDate:'2026-10-19',deliveredByName:'Synthetic',receivedBy:'spoof',receivedAt:'spoof',caseId:'spoof'};
 const options={fetchFn:async(url,init)=>{sent={url,init};return json(record,201);}};
 assert.equal((await staffDocuments(id,kind,values,options)).id,id);
 const body=JSON.parse(sent.init.body);assert.equal('receivedBy' in body,false);assert.equal('receivedAt' in body,false);assert.equal('caseId' in body,false);
 assert.equal(sent.url,`/api/v1/staff/verification-cases/${id}/${kind}`);
 const list=await staffDocuments(id,kind,undefined,{fetchFn:async()=>json([record])});assert.equal(list.length,1);
});
test('Invalid case/receipt never becomes success or mock',async()=>{
 let count=0;const options={fetchFn:async()=>{count++;return json({caseId:id,status:'OPEN'});}};
 await assert.rejects(loadStaffCase('bad',options),{code:'VALIDATION_FAILED'});assert.equal(count,0);
 await assert.rejects(staffDocuments(id,'other',{},options),{code:'VALIDATION_FAILED'});
 await assert.rejects(staffDocuments(id,'death-documents',{}, {fetchFn:async()=>json({...record,caseId:'other'},201)}),{code:'INVALID_RESPONSE'});
 await assert.rejects(loadStaffCase(id,{fetchFn:async()=>json({caseId:'other',status:'OPEN'})}),{code:'INVALID_RESPONSE'});
});
for(const status of [401,403,404,409])test('Live staff propagates API error '+status,async()=>{
 await assert.rejects(claimStaffCase(id,{fetchFn:async()=>json({code:'SERVER_REJECTED'},status)}),{code:'SERVER_REJECTED',status});
});

const attRecord = {
  id: '33333333-3333-4333-8333-333333333333',
  caseId: id,
  subjectType: 'DEATH_DOCUMENT',
  subjectId: id,
  uploadedBy: id,
  fileName: 'cert.pdf',
  sizeBytes: 2048,
  contentType: 'application/pdf',
  sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  uploadedAt: '2026-10-21T10:00:00Z',
};

test('PS-98/PS-103: staffDocumentAttachments loads metadata list with auth and locale', async () => {
  const calls = [];
  const options = {
    accessToken: 'synthetic',
    lang: 'vi',
    fetchFn: async (url, init) => {
      calls.push({ url, init });
      return json([attRecord]);
    },
  };
  const list = await staffDocumentAttachments(id, 'death-documents', id, options);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, attRecord.id);
  assert.equal(calls[0].url, `/api/v1/staff/verification-cases/${id}/death-documents/${id}/attachments`);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer synthetic');
  assert.equal(calls[0].init.headers['Accept-Language'], 'vi');
});

test('PS-98/PS-103: uploadStaffDocumentAttachment sends multipart and validates receipt', async () => {
  const file = new File([new Uint8Array(500)], 'cert.pdf', { type: 'application/pdf' });
  const mockXhr = {
    headers: {},
    upload: {},
    open(method, url) { this.url = url; },
    setRequestHeader(k, v) { this.headers[k] = v; },
    send(data) {
      this.sentData = data;
      this.status = 201;
      this.responseText = JSON.stringify(attRecord);
      this.onload();
    },
  };

  const receipt = await uploadStaffDocumentAttachment(id, 'death-documents', id, file, {
    accessToken: 'synthetic',
    xhrFactory: () => mockXhr,
  });
  assert.equal(receipt.id, attRecord.id);
  assert.equal(mockXhr.url, `/api/v1/staff/verification-cases/${id}/death-documents/${id}/attachments`);
  assert.equal(mockXhr.headers.Authorization, 'Bearer synthetic');

  // Mismatched receipt fails
  const badMockXhr = {
    headers: {},
    upload: {},
    open() {},
    setRequestHeader() {},
    send() {
      this.status = 201;
      this.responseText = JSON.stringify({ ...attRecord, caseId: '11111111-1111-4111-8111-111111111111' });
      this.onload();
    },
  };
  await assert.rejects(
    uploadStaffDocumentAttachment(id, 'death-documents', id, file, {
      accessToken: 'synthetic',
      xhrFactory: () => badMockXhr,
    }),
    { code: 'INVALID_RECEIPT' }
  );
});

test('PS-98/PS-103: readStaffDocumentAttachmentContent fetches binary blob with auth', async () => {
  const calls = [];
  const blobData = new Blob(['sample-pdf'], { type: 'application/pdf' });
  const options = {
    accessToken: 'synthetic',
    lang: 'en',
    fetchFn: async (url, init) => {
      calls.push({ url, init });
      return new Response(blobData, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
    },
  };
  const resBlob = await readStaffDocumentAttachmentContent(id, 'death-documents', id, attRecord.id, options);
  assert.ok(resBlob instanceof Blob);
  assert.equal(calls[0].url, `/api/v1/staff/verification-cases/${id}/death-documents/${id}/attachments/${attRecord.id}/content`);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer synthetic');

  // Error status propagation
  await assert.rejects(
    readStaffDocumentAttachmentContent(id, 'death-documents', id, attRecord.id, {
      fetchFn: async () => json({ code: 'ATTACHMENT_NOT_FOUND' }, 404),
    }),
    { status: 404 }
  );
});

test('PS-96/PS-103: readStaffBasisVersionContent fetches version binary blob with auth', async () => {
  const calls = [];
  const blobData = new Blob(['court-pdf'], { type: 'application/pdf' });
  const options = {
    accessToken: 'synthetic',
    fetchFn: async (url, init) => {
      calls.push({ url, init });
      return new Response(blobData, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
    },
  };
  const resBlob = await readStaffBasisVersionContent(id, 1, options);
  assert.ok(resBlob instanceof Blob);
  assert.equal(calls[0].url, `/api/v1/staff/verification-cases/${id}/basis-dossier/versions/1/content`);
});
