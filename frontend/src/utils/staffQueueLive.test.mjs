import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchStaffCases } from '../pages/staff/staffCaseService.js';
const id = '12345678-1234-4234-8234-123456789012';
const item = { caseId: id, caseNumber: 'HS-2026-000123', vaultId: id, ownerId: id, vaultName: 'Synthetic vault', ownerName: 'Synthetic owner', status: 'OPEN', triggeredAt: '2026-10-17T10:00:00', closedAt: null };
const response = value => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => value });
test('Live queue sends contract query, bearer, locale and cancellation; preserves actual OPEN', async () => {
 let call; const signal = new AbortController().signal;
 const result = await fetchStaffCases({ page: 1, size: 5, status: 'OPEN', accessToken: 'synthetic', isDevPreview: true, lang: 'en', signal,
 fetchFn: async (url, init) => { call = {url,init}; return response({content: [item],page:1,size:5,totalElements:6,totalPages:2}); } });
 assert.match(call.url, /verification-cases\?page=1&size=5&status=OPEN$/);
 assert.equal(call.init.headers.Authorization, 'Bearer synthetic'); assert.equal(call.init.headers['Accept-Language'],'en');
 assert.equal(call.init.signal,signal); assert.equal(call.init.method,'GET');
 assert.equal(result.isSimulation,false); assert.equal(result.content[0].id,id); assert.equal(result.content[0].status,'OPEN');
 assert.equal(result.content[0].caseNumber, 'HS-2026-000123');
});
test('Empty real queue is empty and invalid payloads never become fixture cases', async () => {
 const empty = await fetchStaffCases({ fetchFn: async () => response({content:[],page:0,size:5,totalElements:0,totalPages:0}) });
 assert.deepEqual(empty.content,[]); assert.equal(empty.isSimulation,false);
 for (const raw of [{}, {content:[{...item,status:'VERIFIED'}],page:0,size:5,totalElements:1,totalPages:1}])
 await assert.rejects(fetchStaffCases({fetchFn:async()=>response(raw)}),{code:'INVALID_RESPONSE'});
 await assert.rejects(fetchStaffCases({status:'IN_PROGRESS'}),{code:'VALIDATION_FAILED'});
});

test('Live queue supports CLOSED verification case response and CLOSED filter without INVALID_RESPONSE', async () => {
  const closedCaseResponse = {
    content: [
      {
        caseId: '4d1c9a41-e497-4b70-a19c-53d0bcf27804',
        caseNumber: 'HS-2026-000001',
        status: 'CLOSED',
        triggeredAt: '2026-10-21T05:34:44.6109532',
        closedAt: '2026-10-22T07:18:17.07293',
        vaultId: 'b4d47eef-ed37-468f-8082-49fd7ca05082',
        vaultStatus: 'ARCHIVED',
        vaultName: 'DEMO - Di sản gia đình Nguyễn Minh An',
        ownerId: '55c66de3-7c08-41fa-b681-01e194800d56',
        ownerName: 'Nguyễn Minh An - DEMO',
        assignmentStatus: 'ASSIGNED_TO_CURRENT_STAFF',
        trustee: null,
      },
    ],
    page: 0,
    size: 5,
    totalElements: 1,
    totalPages: 1,
  };

  let capturedUrl;
  const res = await fetchStaffCases({
    page: 0,
    size: 5,
    status: 'CLOSED',
    accessToken: 'synthetic',
    fetchFn: async (url) => {
      capturedUrl = url;
      return response(closedCaseResponse);
    },
  });

  assert.match(capturedUrl, /verification-cases\?page=0&size=5&status=CLOSED$/);
  assert.equal(res.content.length, 1);
  assert.equal(res.content[0].status, 'CLOSED');
  assert.equal(res.content[0].caseNumber, 'HS-2026-000001');
  assert.equal(res.content[0].vaultStatus, 'ARCHIVED');
  assert.equal(res.content[0].assignmentStatus, 'ASSIGNED_TO_CURRENT_STAFF');
  assert.equal(res.content[0].trustee, null);
});
