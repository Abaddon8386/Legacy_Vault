import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchStaffCases } from '../pages/staff/staffCaseService.js';
const id = '12345678-1234-4234-8234-123456789012';
const item = { caseId: id, vaultId: id, ownerId: id, vaultName: 'Synthetic vault', ownerName: 'Synthetic owner', status: 'OPEN', triggeredAt: '2026-10-17T10:00:00', closedAt: null };
const response = value => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => value });
test('Live queue sends contract query, bearer, locale and cancellation; preserves actual OPEN', async () => {
 let call; const signal = new AbortController().signal;
 const result = await fetchStaffCases({ page: 1, size: 5, status: 'OPEN', accessToken: 'synthetic', isDevPreview: true, lang: 'en', signal,
 fetchFn: async (url, init) => { call = {url,init}; return response({content: [item],page:1,size:5,totalElements:6,totalPages:2}); } });
 assert.match(call.url, /verification-cases\?page=1&size=5&status=OPEN$/);
 assert.equal(call.init.headers.Authorization, 'Bearer synthetic'); assert.equal(call.init.headers['Accept-Language'],'en');
 assert.equal(call.init.signal,signal); assert.equal(call.init.method,'GET');
 assert.equal(result.isSimulation,false); assert.equal(result.content[0].id,id); assert.equal(result.content[0].status,'OPEN');
});
test('Empty real queue is empty and invalid payloads never become fixture cases', async () => {
 const empty = await fetchStaffCases({ fetchFn: async () => response({content:[],page:0,size:5,totalElements:0,totalPages:0}) });
 assert.deepEqual(empty.content,[]); assert.equal(empty.isSimulation,false);
 for (const raw of [{}, {content:[{...item,status:'VERIFIED'}],page:0,size:5,totalElements:1,totalPages:1}])
 await assert.rejects(fetchStaffCases({fetchFn:async()=>response(raw)}),{code:'INVALID_RESPONSE'});
 await assert.rejects(fetchStaffCases({status:'IN_PROGRESS'}),{code:'VALIDATION_FAILED'});
});
